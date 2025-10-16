import { supabase } from "../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadHires);

async function loadHires() {
  const { data: { user } } = await supabase.auth.getUser();
  const container = document.getElementById("hiresList");
  
  if (!user) {
    container.innerHTML = "<p class='error'>You must log in first.</p>";
    return;
  }

  // Show loading state
  container.innerHTML = "<div class='loading'>Loading your active hires...</div>";

  // First, get all final submissions to check which hires have approved submissions
  const { data: finalSubmissions, error: submissionsError } = await supabase
    .from("final_submissions")
    .select("hire_id, status")
    .eq("freelancer_id", user.id);

  if (submissionsError) {
    console.error("Error loading final submissions:", submissionsError);
    // Continue with loading hires anyway
  }

  // Create a set of hire IDs that have approved submissions
  const approvedHireIds = new Set();
  if (finalSubmissions) {
    finalSubmissions.forEach(submission => {
      if (submission.status === "approved") {
        approvedHireIds.add(submission.hire_id);
      }
    });
  }

  // ✅ FIXED QUERY - Get all hires first, then filter for single payment
  const { data: hires, error } = await supabase
    .from("hires")
    .select(`
      id,
      created_at,
      job_id,
      jobs(title, description, payment_type),
      users!hires_client_id_fkey(full_name)
    `)
    .eq("freelancer_id", user.id);

  if (error) {
    console.error(error);
    container.innerHTML = "<p class='error'>Error loading hires. Please try again.</p>";
    return;
  }

  if (!hires || hires.length === 0) {
    container.innerHTML = `
      <div class="empty-hires">
        <h3>No Active Hires</h3>
        <p>You don't have any active hires at the moment.</p>
        <p>Complete your profile and apply to jobs to get hired!</p>
      </div>
    `;
    return;
  }

  // ✅ FILTER FOR SINGLE PAYMENT JOBS ONLY
  const singlePaymentHires = hires.filter(hire => 
    hire.jobs && hire.jobs.payment_type === 'single'
  );

  if (singlePaymentHires.length === 0) {
    container.innerHTML = `
      <div class="empty-hires">
        <h3>No Active Single Payment Jobs</h3>
        <p>You don't have any active single payment hires at the moment.</p>
        <p>Check your milestones page for milestone-based projects.</p>
      </div>
    `;
    return;
  }

  // Filter out hires that have approved final submissions
  const filteredHires = singlePaymentHires.filter(hire => !approvedHireIds.has(hire.id));

  if (filteredHires.length === 0) {
    container.innerHTML = `
      <div class="empty-hires">
        <h3>All Single Payment Projects Completed! 🎉</h3>
        <p>All your single payment jobs have approved final submissions.</p>
        <p>Great work! Check your dashboard for new opportunities.</p>
      </div>
    `;
    return;
  }

  // Update pending count with filtered hires
  document.getElementById('pendingCount').textContent = filteredHires.length;

  // Render filtered hires
  container.innerHTML = '<div class="hires-grid"></div>';
  const hiresGrid = container.querySelector('.hires-grid');

  filteredHires.forEach((hire, index) => {
    const hireCard = document.createElement("div");
    hireCard.className = "hire-card";
    hireCard.style.animationDelay = `${index * 0.1}s`;
    
    hireCard.innerHTML = `
      <div class="hire-header">
        <h3 class="hire-title">${hire.jobs.title}</h3>
        <span class="payment-badge single-badge">💳 Single Payment</span>
      </div>
      
      <div class="hire-client">
        <strong>Client:</strong> ${hire.users.full_name}
      </div>
      
      <div class="hire-description">
        ${hire.jobs.description}
      </div>
      
      <div class="hire-actions">
        <button class="btn-submit-final" data-id="${hire.id}">
          📤 Submit Final Project
        </button>
      </div>
      
      <div class="final-form" id="form-${hire.id}">
        <p>Upload your completed project in ZIP format for quality review.</p>
        
        <div class="file-upload-wrapper">
          <div class="file-input-wrapper">
            <input type="file" id="file-${hire.id}" accept=".zip" />
          </div>
          <button class="btn-upload-final" data-id="${hire.id}">
            🚀 Upload Final Project
          </button>
        </div>
      </div>
      
      <div class="hire-meta">
        <span class="hire-date">Hired: ${new Date(hire.created_at).toLocaleDateString()}</span>
        <span class="hire-id">#${hire.id}</span>
      </div>
    `;

    hiresGrid.appendChild(hireCard);
  });

  // Show form toggle
  document.querySelectorAll(".btn-submit-final").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const hireId = e.target.dataset.id;
      const form = document.getElementById(`form-${hireId}`);
      form.classList.toggle("active");
      
      // Update button text
      if (form.classList.contains("active")) {
        e.target.innerHTML = "📋 Hide Submission Form";
      } else {
        e.target.innerHTML = "📤 Submit Final Project";
      }
    });
  });

  // Handle uploads
  document.querySelectorAll(".btn-upload-final").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const hireId = e.target.dataset.id;
      const fileInput = document.getElementById(`file-${hireId}`);
      const file = fileInput.files[0];
      
      if (!file) {
        alert("Please select a ZIP file before uploading.");
        return;
      }
      
      if (!file.name.toLowerCase().endsWith('.zip')) {
        alert("Please upload a ZIP file only.");
        return;
      }
      
      await submitFinal(hireId, file);
    });
  });
}

async function submitFinal(hireId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Please login to submit final project.");
    return;
  }

  // Show loading state on button
  const button = document.querySelector(`.btn-upload-final[data-id="${hireId}"]`);
  const originalText = button.innerHTML;
  button.innerHTML = '📤 Uploading...';
  button.disabled = true;

  const path = `finals/${hireId}/${Date.now()}-${file.name}`;
  console.log("Uploading to path:", path, "in bucket: submissions");

  // Upload file to Supabase storage
  const { error: upErr } = await supabase.storage
    .from("submissions")
    .upload(path, file);

  if (upErr) {
    console.error("Upload failed:", upErr);
    alert("Upload failed: " + upErr.message);
    button.innerHTML = originalText;
    button.disabled = false;
    return;
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(path);
  const fileUrl = urlData.publicUrl;

  // Fetch client_id from hire
  const { data: hire } = await supabase
    .from("hires")
    .select("client_id")
    .eq("id", hireId)
    .single();

  // Insert final submission row
  const { error } = await supabase.from("final_submissions").insert({
    hire_id: hireId,
    freelancer_id: user.id,
    client_id: hire.client_id,
    file_url: fileUrl,
    status: "submitted"
  });

  if (error) {
    console.error(error);
    alert("Failed to submit final project");
    button.innerHTML = originalText;
    button.disabled = false;
    return;
  }

  // Show success and reload
  button.innerHTML = '✅ Submitted!';
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}

// Theme Toggle Functionality
function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle.querySelector('.theme-icon');
  const themeLabel = themeToggle.querySelector('.theme-label');
  
  // Check for saved theme or prefer-color-scheme
  const savedTheme = localStorage.getItem('theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  
  if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIcon.textContent = '🌙';
    themeLabel.textContent = 'Dark Mode';
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeIcon.textContent = '☀️';
    themeLabel.textContent = 'Light Mode';
  }
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    
    if (currentTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeIcon.textContent = '☀️';
      themeLabel.textContent = 'Light Mode';
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Dark Mode';
      localStorage.setItem('theme', 'light');
    }
  });
}

// Initialize theme toggle when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
});