// client-raise-dispute.js
import { supabase } from "../../supabase/config.js";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.getElementById("submitDispute").addEventListener("click", submitDispute);
  document.getElementById("cancelBtn").addEventListener("click", () => window.history.back());

  await loadApprovedFinals();
  await loadMyDisputes(); // 👈 NEW
}

async function loadApprovedFinals() {
  const select = document.getElementById("finalSelect");
  select.innerHTML = `<option value="">Loading...</option>`;

  // Get current user
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    select.innerHTML = `<option value="">Please login</option>`;
    return;
  }

  try {
    // We want final_submissions approved for hires where client is this user
    const { data, error } = await supabase
      .from("final_submissions")
      .select(`
        id,
        hire_id,
        file_url,
        created_at,
        hires (
          id,
          job_id,
          jobs(title),
          client_id,
          freelancer_id
        )
      `)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Filter client-owned ones (some schemas don't allow join client_id inside hires->jobs easily)
    const clientFinals = data.filter(f => f.hires?.client_id === user.id);

    if (!clientFinals || clientFinals.length === 0) {
      select.innerHTML = `<option value="">No approved submissions available</option>`;
      return;
    }

    select.innerHTML = `<option value="">-- Select submission to dispute --</option>`;
    clientFinals.forEach(f => {
      const label = `${f.hires.jobs?.title ?? "Untitled"} — submitted ${new Date(f.created_at).toLocaleString()}`;
      // We'll store value as JSON string with hire_id and final_id
      const payload = JSON.stringify({ final_id: f.id, hire_id: f.hire_id, freelancer_id: f.hires.freelancer_id });
      select.innerHTML += `<option value='${encodeURIComponent(payload)}'>${escapeHtml(label)}</option>`;
    });
  } catch (err) {
    console.error("Error loading finals:", err);
    select.innerHTML = `<option value="">Error loading submissions</option>`;
  }
}

async function submitDispute(e) {
  e.preventDefault();
  const resultEl = document.getElementById("result");
  resultEl.textContent = "";

  const select = document.getElementById("finalSelect");
  const selected = select.value;
  if (!selected) {
    resultEl.textContent = "Please select a final submission to dispute.";
    return;
  }

  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(selected));
  } catch (err) {
    resultEl.textContent = "Invalid selection.";
    return;
  }

  const { final_id: finalId, hire_id: hireId, freelancer_id: freelancerId } = payload;
  const reason = document.getElementById("reason").value.trim();
  const proofFile = document.getElementById("proof").files[0];

  if (!reason) {
    resultEl.textContent = "Please describe the issue in the reason field.";
    return;
  }

  // Make sure user logged in
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    resultEl.textContent = "You must be logged in to raise a dispute.";
    return;
  }

  resultEl.textContent = "Submitting dispute...";

  try {
    // 1) Insert dispute row (without proof_path initially); return id
    const { data: disputeRow, error: insertErr } = await supabase
      .from("disputes")
      .insert([{
        hire_id: hireId,
        client_id: user.id,
        freelancer_id: freelancerId,
        reason,
        status: "open"
      }])
      .select("id")
      .single();

    if (insertErr) throw insertErr;
    const disputeId = disputeRow.id;

    // 2) Upload proof (if any) to storage bucket `dispute_proofs` - path includes dispute id
    let proofPath = null;
    if (proofFile) {
      const path = `disputes/${disputeId}/${Date.now()}-${sanitizeFilename(proofFile.name)}`;
      const { error: upErr } = await supabase.storage.from("dispute_proofs").upload(path, proofFile);
      if (upErr) {
        // If upload fails, we'll continue but warn admin later
        console.warn("Proof upload failed:", upErr);
        // you might want to delete disputeRow or set proof_path null - we proceed but inform user
      } else {
        proofPath = path;
        // update dispute with proof_path
        const { error: updErr } = await supabase.from("disputes").update({ proof_path: path }).eq("id", disputeId);
        if (updErr) console.warn("Could not update dispute proof path:", updErr);
      }
    }

    // 3) Update coin_holds: set status = 'disputed' and dispute_id
    const { data: chData, error: chErr } = await supabase
      .from("coin_holds")
      .update({ status: "disputed", dispute_id: disputeId })
      .eq("hire_id", hireId);

    if (chErr) {
      // it's important to surface if coin_holds update failed (maybe no hold exists)
      console.warn("coin_holds update failed:", chErr);
      // we still proceed because dispute exists — admin will have to check
    }

    // 4) Notify admin (insert a notification row) -- optional but useful
    await supabase.from("notifications").insert({
      user_id: null, // or admin id if you store admin accounts; null for system-level notifications
      type: "dispute",
      message: `Client ${user.id} opened dispute ${disputeId} for hire ${hireId}`
    });

    resultEl.innerHTML = `✅ Dispute submitted (ID: ${disputeId}). Admin will review soon.`;
    // reset form lightly
    document.getElementById("reason").value = "";
    document.getElementById("proof").value = "";
    // reload submissions list (to reflect state)
    await loadApprovedFinals();
  } catch (err) {
    console.error("Submit dispute error:", err);
    resultEl.innerHTML = `<span style="color:crimson;">Failed to submit dispute: ${err.message || JSON.stringify(err)}</span>`;
  }
}

/* helpers */
function escapeHtml(s) {
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function sanitizeFilename(n) {
  return n.replaceAll(/[^a-zA-Z0-9.\-_]/g, "_");
}



async function loadMyDisputes() {
  const container = document.getElementById("myDisputesList");
  if (!container) return;

  container.innerHTML = "<p>Loading your disputes...</p>";

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    container.innerHTML = "<p>You must log in to view your disputes.</p>";
    return;
  }

  try {
    const { data, error } = await supabase
      .from("disputes")
      .select(`
        id,
        hire_id,
        reason,
        status,
        proof_path,
        created_at,
        hires (jobs (title))
      `)
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = "<p>You have no disputes yet.</p>";
      return;
    }

    // Build cards
    const disputeCards = await Promise.all(data.map(async (d) => {
      const jobTitle = d.hires?.jobs?.title || "Untitled job";
      const statusColor =
        d.status === "open"
          ? "orange"
          : d.status === "resolved"
          ? "green"
          : "crimson";

      let proofHtml = `<p><em>No proof uploaded</em></p>`;
      if (d.proof_path) {
        const signed = await getSignedProofURL(d.proof_path);
        proofHtml = signed && signed !== "#" 
          ? `<p><a href="${signed}" target="_blank">📎 View Uploaded Proof</a></p>`
          : `<p><em>Proof uploaded (access error)</em></p>`;
      }

      return `
        <div class="dispute-card" style="border:1px solid #ccc; border-radius:10px; padding:10px; margin-bottom:10px;">
          <h3 style="margin:0;">${escapeHtml(jobTitle)}</h3>
          <p><strong>Reason:</strong> ${escapeHtml(d.reason)}</p>
          <p><strong>Date:</strong> ${new Date(d.created_at).toLocaleString()}</p>
          <p><strong>Status:</strong> 
            <span style="color:${statusColor}; font-weight:bold;">${d.status.toUpperCase()}</span>
          </p>
          ${proofHtml}
        </div>
      `;
    }));

    container.innerHTML = disputeCards.join("");
  } catch (err) {
    console.error("Error loading disputes:", err);
    container.innerHTML = "<p>Error loading disputes.</p>";
  }
}

// 👇 Helper to generate temporary signed URL for private proofs
async function getSignedProofURL(path) {
  try {
    const { data, error } = await supabase.storage
      .from("dispute_proofs")
      .createSignedUrl(path, 3600); // 1 hour validity
    if (error || !data?.signedUrl) return "#";
    return data.signedUrl;
  } catch (err) {
    console.warn("Signed URL failed:", err);
    return "#";
  }
}