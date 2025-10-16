import { supabase } from "../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadPreviews);

async function loadPreviews() {
  const { data: { user } } = await supabase.auth.getUser();
  const container = document.getElementById("previewsList");
  
  if (!user) {
    container.innerHTML = "<p class='error'>You must log in as a client.</p>";
    return;
  }

  // Show loading state
  container.innerHTML = "<div class='loading'>Loading preview submissions...</div>";

  const { data, error } = await supabase
    .from("preview_submissions")
    .select(`
      id,
      hire_id,
      file_url,
      status,
      created_at,
      hires(jobs(title), users!hires_freelancer_id_fkey(full_name))
    `)
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = "<p class='error'>Error loading previews. Please try again.</p>";
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-previews">
        <h3>No Preview Submissions</h3>
        <p>You haven't received any preview submissions yet.</p>
        <p>Freelancers will submit previews as they work on your projects.</p>
      </div>
    `;
    return;
  }

  // Update summary counters
  updateSummaryCounters(data);

  // Render previews
  container.innerHTML = '<div class="previews-grid"></div>';
  const previewsGrid = container.querySelector('.previews-grid');

  data.forEach((preview, index) => {
    const previewCard = document.createElement("div");
    previewCard.className = "preview-card";
    previewCard.setAttribute("data-status", preview.status);
    previewCard.style.animationDelay = `${index * 0.1}s`;

    previewCard.innerHTML = `
      <div class="preview-header">
        <h3 class="preview-title">${preview.hires.jobs.title}</h3>
        <span class="preview-badge status-${preview.status}">${formatStatus(preview.status)}</span>
      </div>
      
      <div class="preview-details">
        <div class="detail-item">
          <span class="detail-label">Freelancer</span>
          <span class="detail-value">${preview.hires.users.full_name}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Hire ID</span>
          <span class="detail-value">#${preview.hire_id}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Preview ID</span>
          <span class="detail-value">#${preview.id}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Submitted</span>
          <span class="detail-value">${new Date(preview.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      
      <div class="preview-actions">
        <a href="${preview.file_url}" target="_blank" class="btn-view">
          View Preview
        </a>
        
        ${preview.status === "submitted" ? `
          <button class="btn-accept" data-id="${preview.id}">
            Accept Preview
          </button>
          <button class="btn-reject" data-id="${preview.id}">
            Reject Preview
          </button>
        ` : `
          <button class="btn-disabled" disabled>
            ${preview.status === "accepted" ? "✅ Accepted" : "❌ Rejected"}
          </button>
        `}
      </div>
      
      <div class="preview-meta">
        <span class="preview-date">Submitted: ${new Date(preview.created_at).toLocaleString()}</span>
        <span class="preview-id">#${preview.id}</span>
      </div>
    `;

    previewsGrid.appendChild(previewCard);
  });

  // Handle accept/reject
  document.querySelectorAll(".btn-accept").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await updatePreviewStatus(id, "accepted");
    });
  });

  document.querySelectorAll(".btn-reject").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await updatePreviewStatus(id, "rejected");
    });
  });
}

function updateSummaryCounters(previews) {
  const total = previews.length;
  const pending = previews.filter(p => p.status === "submitted").length;
  const reviewed = previews.filter(p => p.status !== "submitted").length;

  document.getElementById('totalPreviews').textContent = total;
  document.getElementById('pendingPreviews').textContent = pending;
  document.getElementById('reviewedPreviews').textContent = reviewed;
}

function formatStatus(status) {
  const statusMap = {
    'submitted': 'Pending Review',
    'accepted': 'Accepted',
    'rejected': 'Rejected'
  };
  return statusMap[status] || status;
}

async function updatePreviewStatus(id, status) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert("Please login to update preview status.");
    return;
  }

  // Show loading state on button
  const buttons = document.querySelectorAll(`[data-id="${id}"]`);
  buttons.forEach(btn => {
    btn.disabled = true;
    if (status === "accepted") {
      btn.innerHTML = '<span class="btn-icon">⏳</span> Accepting...';
    } else {
      btn.innerHTML = '<span class="btn-icon">⏳</span> Rejecting...';
    }
  });

  const { error } = await supabase
    .from("preview_submissions")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error(error);
    alert("Failed to update status");
    // Reset buttons
    buttons.forEach(btn => {
      btn.disabled = false;
      if (btn.classList.contains('btn-accept')) {
        btn.innerHTML = '<span class="btn-icon">✅</span> Accept Preview';
      } else {
        btn.innerHTML = '<span class="btn-icon">❌</span> Reject Preview';
      }
    });
    return;
  }

  // Notify freelancer
  const { data: preview } = await supabase
    .from("preview_submissions")
    .select("freelancer_id, hire_id")
    .eq("id", id)
    .single();

  if (preview?.freelancer_id) {
    await supabase.from("notifications").insert({
      user_id: preview.freelancer_id,
      type: "preview",
      message: `Client marked your preview for hire ${preview.hire_id} as ${status}.`
    });
  }

  // Show success and reload
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}
