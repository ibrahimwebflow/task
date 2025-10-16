import { supabase } from "../../../supabase/config.js";

async function requireAdmin() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    // Not logged in → redirect to client login
    window.location.href = "../client/login.html";
    return;
  }

  // Check role in users table
  const { data, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userError || !data || data.role !== "admin") {
    // Not an admin → redirect
    window.location.href = "../client/login.html";
  }
}

// 🔥 Call immediately on page load
document.addEventListener("DOMContentLoaded", requireAdmin);

document.addEventListener("DOMContentLoaded", loadFinalSubmissions);

async function loadFinalSubmissions() {
  const { data: { user } } = await supabase.auth.getUser();
  const container = document.getElementById("finalSubmissionsList");
  
  if (!user) {
    container.innerHTML = "<p class='error'>You must log in as admin.</p>";
    return;
  }

  // Fetch submissions with status "submitted"
  const { data, error } = await supabase
    .from("final_submissions")
    .select(`
      id,
      hire_id,
      file_url,
      status,
      created_at,
      hires(
        jobs(title),
        freelancer:users!hires_freelancer_id_fkey(full_name),
        client:users!hires_client_id_fkey(full_name)
      )
    `)
    .eq("status", "submitted")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = "<p class='error'>Error loading final submissions.</p>";
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "<p class='empty-state'>No pending final submissions.</p>";
    return;
  }

  container.innerHTML = "";
  
  data.forEach((sub) => {
    const div = document.createElement("div");
    div.classList.add("submission-card");
    
    div.innerHTML = `
      <h3>${sub.hires.jobs.title}</h3>
      
      <div class="submission-meta">
        <div class="meta-item">
          <span class="meta-label">Freelancer</span>
          <span class="meta-value">${sub.hires.freelancer?.full_name || 'N/A'}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Client</span>
          <span class="meta-value">${sub.hires.client?.full_name || 'N/A'}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Submitted</span>
          <span class="meta-value">${new Date(sub.created_at).toLocaleString()}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Status</span>
          <span class="status-badge status-${sub.status}">${sub.status}</span>
        </div>
      </div>
      
      <p><b>Project Files:</b> <a href="${sub.file_url}" target="_blank">Download Final Delivery</a></p>
      
      <div class="action-buttons">
        <button class="approve-btn" data-id="${sub.id}" data-hire="${sub.hire_id}">
          ✅ Approve Quality
        </button>
        <button class="reject-btn" data-id="${sub.id}" data-hire="${sub.hire_id}">
          ❌ Request Revisions
        </button>
      </div>
    `;
    
    container.appendChild(div);
  });

  // Approve buttons
  document.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      const hireId = e.target.dataset.hire;
      await updateFinalStatus(id, hireId, "approved");
    });
  });

  // Reject buttons
  document.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      const hireId = e.target.dataset.hire;
      await updateFinalStatus(id, hireId, "rejected");
    });
  });
}

async function updateFinalStatus(id, hireId, status) {
  // Update submission status
  const { error } = await supabase
    .from("final_submissions")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error(error);
    alert("Failed to update status");
    return;
  }

  // Fetch hire for notifications
  const { data: hire } = await supabase
    .from("hires")
    .select("client_id, freelancer_id")
    .eq("id", hireId)
    .single();

if (status === "approved") {
  // Notify client
  await supabase.from("notifications").insert({
    user_id: hire.client_id,
    type: "final",
    message: `Admin approved final project for hire ${hireId}. You can now create a contract.`,
  });

  // 🔥 NEW: Release held coins to freelancer
  const { data: releaseData, error: releaseError } = await supabase.rpc(
    "release_funds_after_submission",
    { _hire_id: hireId }
  );

  if (releaseError) {
    console.error("Coin release failed:", releaseError);
    alert("Project approved but coin release failed — please check manually.");
  } else {
    console.log("Coins released:", releaseData);
    await supabase.from("notifications").insert({
      user_id: hire.freelancer_id,
      type: "payment",
      message: `Your payment of ${releaseData.amount} TN has been released.`,
    });
  }
}


  alert(`Final submission marked as ${status}`);
  loadFinalSubmissions(); // Refresh the list
}