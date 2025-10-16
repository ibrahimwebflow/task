import { supabase } from "../../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadFinals);

async function loadFinals() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById("finalsList").innerHTML = "<p>You must log in as client.</p>";
    return;
  }

  // Fetch final submissions for this client that are approved
  const { data, error } = await supabase
    .from("final_submissions")
    .select(`
      id,
      hire_id,
      file_url,
      status,
      created_at,
      hires(jobs(title), users!hires_freelancer_id_fkey(full_name))
    `)
    .eq("client_id", user.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  const container = document.getElementById("finalsList");

  if (error) {
    container.innerHTML = "<p>Error loading final submissions.</p>";
    console.error(error);
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = "<p>No approved final submissions yet.</p>";
    return;
  }

  container.innerHTML = "";
  data.forEach(final => {
    const div = document.createElement("div");
    div.classList.add("card");
    div.innerHTML = `
      <h3>Job: ${final.hires.jobs.title}</h3>
      <p><b>Freelancer:</b> ${final.hires.users.full_name}</p>
      <p><b>Submitted:</b> ${new Date(final.created_at).toLocaleString()}</p>
      <p><a href="${final.file_url}" target="_blank">Preview Final Project</a></p>
      <p><b>Status:</b> ${final.status}</p>
      <button class="create-contract-btn" data-id="${final.id}" data-hire="${final.hire_id}">
        Create Contract to Unlock
      </button>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll(".create-contract-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const finalId = e.target.dataset.id;
      const hireId = e.target.dataset.hire;
      await createContract(hireId, finalId);
    });
  });
}

async function createContract(hireId, finalSubmissionId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Insert contract tied to final submission
  const { error } = await supabase.from("contracts").insert({
    hire_id: hireId,
    client_id: user.id,
    final_submission_id: finalSubmissionId,
    status: "pending"
  });

  if (error) {
    console.error(error);
    alert("Failed to create contract");
    return;
  }

  alert("Contract created successfully! Proceed to payment.");
  window.location.href = "contracts.html"; // or your contracts page
}
