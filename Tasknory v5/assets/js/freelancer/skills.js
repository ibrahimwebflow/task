import { supabase } from "../../../supabase/config.js";

document.addEventListener("DOMContentLoaded", () => {
  loadSkills();
  loadSkillOptions();
  document.getElementById("addSkillBtn").addEventListener("click", addSkill);
});

// Load freelancer skills
async function loadSkills() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Please log in.");
    return;
  }

  const { data, error } = await supabase
    .from("freelancer_skills")
    .select(`
      id,
      verified,
      skill_id,
      skills_master(skill_name),
      skill_verifications(status)
    `)
    .eq("freelancer_id", user.id);

  if (error) {
    console.error("Error loading skills:", error);
    return;
  }

  // Clear containers
  document.getElementById("verifiedSkills").innerHTML = "";
  document.getElementById("pendingSkills").innerHTML = "";
  document.getElementById("unverifiedSkills").innerHTML = "";

  // Show empty states if no skills
  if (!data || data.length === 0) {
    document.getElementById("verifiedSkills").innerHTML = '<div class="empty-state">No verified skills yet</div>';
    document.getElementById("pendingSkills").innerHTML = '<div class="empty-state">No pending verifications</div>';
    document.getElementById("unverifiedSkills").innerHTML = '<div class="empty-state">No unverified skills</div>';
    return;
  }

  data.forEach(skill => {
    const div = document.createElement("div");
    div.className = "skill-card";
    div.innerHTML = `<p>${skill.skills_master.skill_name}</p>`;

    // If already verified
    if (skill.verified) {
      div.innerHTML += `<span class="badge verified">Verified</span>`;
      document.getElementById("verifiedSkills").appendChild(div);
    } else {
      // Check if there are any verification attempts
      if (Array.isArray(skill.skill_verifications) && skill.skill_verifications.length > 0) {
        // Get latest verification status (last item in array)
        const latestVerification = skill.skill_verifications.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        )[0];

        if (latestVerification.status === "pending") {
          div.innerHTML += `<span class="badge pending">Pending</span>`;
          document.getElementById("pendingSkills").appendChild(div);
        } else if (latestVerification.status === "rejected") {
          div.innerHTML += `<span class="badge rejected">Rejected</span>`;
          const btn = document.createElement("button");
          btn.textContent = "Verify Again";
          btn.className = "btn btn-outline";
          btn.addEventListener("click", () => showVerifyForm(skill.id, div));
          div.appendChild(btn);
          document.getElementById("unverifiedSkills").appendChild(div);
        } else {
          // fallback: treat as unverified
          const btn = document.createElement("button");
          btn.textContent = "Verify Now";
          btn.className = "btn btn-primary";
          btn.addEventListener("click", () => showVerifyForm(skill.id, div));
          div.appendChild(btn);
          document.getElementById("unverifiedSkills").appendChild(div);
        }
      } else {
        // No verification attempt yet → unverified
        const btn = document.createElement("button");
        btn.textContent = "Verify Now";
        btn.className = "btn btn-primary";
        btn.addEventListener("click", () => showVerifyForm(skill.id, div));
        div.appendChild(btn);
        document.getElementById("unverifiedSkills").appendChild(div);
      }
    }
  });
}

// Load skill options from skills_master
async function loadSkillOptions() {
  const { data, error } = await supabase
    .from("skills_master")
    .select("id, skill_name")
    .order("skill_name", { ascending: true });

  if (error) {
    console.error("Error loading skill options:", error);
    return;
  }

  const select = document.getElementById("skillSelect");
  // Clear existing options except the first one
  while (select.children.length > 1) {
    select.removeChild(select.lastChild);
  }
  
  data.forEach(skill => {
    const opt = document.createElement("option");
    opt.value = skill.id;
    opt.textContent = skill.skill_name;
    select.appendChild(opt);
  });
}

// Add new skill
async function addSkill() {
  const skillId = document.getElementById("skillSelect").value;
  if (!skillId) {
    alert("Please select a skill.");
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Please log in.");
    return;
  }

  // Check if skill already exists
  const { data: existingSkill } = await supabase
    .from("freelancer_skills")
    .select("id")
    .eq("freelancer_id", user.id)
    .eq("skill_id", skillId)
    .single();

  if (existingSkill) {
    alert("You already have this skill in your profile.");
    return;
  }

  const { error } = await supabase
    .from("freelancer_skills")
    .insert([{ freelancer_id: user.id, skill_id: skillId, verified: false }]);

  if (error) {
    console.error("Error adding skill:", error);
    alert("Could not add skill.");
    return;
  }

  // Show success message
  showNotification("Skill added successfully!", "success");
  
  // Reset select and reload skills
  document.getElementById("skillSelect").value = "";
  loadSkills();
}

// Show verification form
function showVerifyForm(freelancerSkillId, parentDiv) {
  // Prevent duplicates
  if (parentDiv.querySelector(".verify-form")) return;

  const tmpl = document.getElementById("verifyFormTemplate");
  const form = tmpl.content.cloneNode(true);

  form.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const years = e.target.years_experience.value;
    const reference = e.target.reference_link.value;
    const file = e.target.proof.files[0];

    // Validate inputs
    if (!years || years < 0) {
      alert("Please enter a valid number of years of experience.");
      return;
    }

    if (!reference) {
      alert("Please provide a reference link.");
      return;
    }

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = "Submitting...";
    submitBtn.disabled = true;

    let proofUrl = null;
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("File size must be less than 5MB.");
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        return;
      }

      const path = `skill-proofs/${freelancerSkillId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("proofs").upload(path, file);
      if (upErr) {
        alert("Upload failed: " + upErr.message);
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        return;
      }
      const { data: urlData } = supabase.storage.from("proofs").getPublicUrl(path);
      proofUrl = urlData.publicUrl;
    }

    const { error } = await supabase.from("skill_verifications").insert([{
      freelancer_skill_id: freelancerSkillId,
      years_experience: years,
      reference_link: reference,
      proof_url: proofUrl,
      status: "pending"
    }]);

    if (error) {
      console.error("Error submitting verification:", error);
      alert("Verification request failed.");
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      return;
    }

    showNotification("Verification submitted successfully!", "success");
    
    // Reset button state
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    
    // Reload skills to update UI
    loadSkills();
  });

  // Add cancel button
  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-outline";
  cancelBtn.style.marginLeft = "10px";
  cancelBtn.addEventListener("click", () => {
    parentDiv.removeChild(parentDiv.querySelector(".verify-form"));
  });

  form.querySelector("form").appendChild(cancelBtn);
  parentDiv.appendChild(form);
}

// Utility function to show notifications
function showNotification(message, type = "info") {
  // Create notification element
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-weight: 600;
    z-index: 10000;
    animation: slideInRight 0.3s ease-out;
    max-width: 300px;
  `;
  
  // Set background based on type
  if (type === "success") {
    notification.style.background = "var(--gradient-secondary)";
  } else if (type === "error") {
    notification.style.background = "linear-gradient(135deg, #ff5c8d 0%, #e91e63 100%)";
  } else {
    notification.style.background = "var(--gradient-primary)";
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = "slideOutRight 0.3s ease-in";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Add CSS for notification animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  .empty-state {
    text-align: center;
    padding: var(--space-8);
    color: var(--text-muted);
    font-style: italic;
    grid-column: 1 / -1;
  }
`;
document.head.appendChild(style);

// Export functions for potential use elsewhere
export { loadSkills, loadSkillOptions, addSkill, showVerifyForm };


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
