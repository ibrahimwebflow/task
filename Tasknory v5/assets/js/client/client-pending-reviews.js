import { supabase } from "../../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadPendingReviews);

async function loadPendingReviews() {
  const container = document.getElementById("pendingReviewsList");

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    container.innerHTML = "<p class='error'>You must be logged in.</p>";
    return;
  }

  try {
    // Step 1️⃣ - Fetch approved submissions
    const { data: submissions, error: subErr } = await supabase
      .from("final_submissions")
      .select(`
        id,
        hire_id,
        file_url,
        created_at,
        status,
        hires (
          id,
          jobs(title),
          freelancer:users!hires_freelancer_id_fkey(full_name)
        )
      `)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (subErr) throw subErr;

    if (!submissions || submissions.length === 0) {
      container.innerHTML = "<p class='empty-state'>No pending reviews.</p>";
      return;
    }

    // Step 2️⃣ - Fetch all coin holds for those hires
    const hireIds = submissions.map((s) => s.hire_id);
    const { data: holds, error: holdErr } = await supabase
      .from("coin_holds")
      .select("hire_id, amount, status")
      .in("hire_id", hireIds);

    if (holdErr) throw holdErr;

    // Step 3️⃣ - Combine
    const holdMap = {};
    holds?.forEach((h) => (holdMap[h.hire_id] = h));

    const pendingSubs = submissions.filter((s) => {
      const hold = holdMap[s.hire_id];
      return hold && hold.status !== "released" && hold.status !== "disputed";
    });

    if (pendingSubs.length === 0) {
      container.innerHTML =
        "<p class='empty-state'>No pending (held) projects.</p>";
      return;
    }

    container.innerHTML = "";

    pendingSubs.forEach((sub, index) => {
      const hire = sub.hires;
      const hold = holdMap[sub.hire_id];

      const autoReleaseTime = new Date(sub.created_at);
      autoReleaseTime.setHours(autoReleaseTime.getHours() + 12);
      const remainingMs = autoReleaseTime - new Date();
      const remainingHours = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60)));

      const div = document.createElement("div");
      div.classList.add("submission-card");
      div.style.animationDelay = `${index * 0.1}s`;

      div.innerHTML = `
        <h3>${hire.jobs.title}</h3>
        <p><strong>Freelancer:</strong> ${hire.freelancer.full_name}</p>
        <p><strong>Submitted:</strong> ${new Date(sub.created_at).toLocaleString()}</p>
        <p><strong>Auto-release in:</strong> ${remainingHours}h</p>
        <p><strong>Hold status:</strong> ${hold.status}</p>
        <p><strong>Held amount:</strong> ${Number(hold.amount).toFixed(2)} TN</p>
        <p><a href="${sub.file_url}" target="_blank">📂 View Final Work</a></p>

        <div class="review-actions">
          <button class="btn btn-success confirm-btn" data-hire="${sub.hire_id}">Confirm Work ✅</button>
          <button class="btn btn-danger dispute-btn"">Raise Dispute ⚠️</button>
        </div>
      `;

      container.appendChild(div);
    });

    // Buttons
    document.querySelectorAll(".confirm-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const hireId = e.target.dataset.hire;
        await confirmWork(hireId);
      });
    });

document.querySelectorAll(".dispute-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    window.location.href = '../disputes.html';
  });
});
  } catch (err) {
    console.error("Load error:", err);
    container.innerHTML = `<p class='error'>${err.message}</p>`;
  }
}

// Keep your existing confirmWork() and raiseDispute() functions


// keep your existing confirmWork and raiseDispute functions intact
// ... (confirmWork and raiseDispute as in your existing file) ...
// ✅ Confirm Work → release frozen coin
async function confirmWork(hireId) {
  try {
    const { error } = await supabase.rpc("release_frozen_coin", { _hire_id: hireId });
    if (error) throw error;

    alert("✅ Work confirmed. TN coins released to freelancer!");
    loadPendingReviews();
  } catch (err) {
    console.error("Confirm failed:", err);
    alert("Failed to release coin: " + err.message);
  }
}

// ⚠️ Raise Dispute → freeze coin + log issue
// async function raiseDispute(hireId) {
//   const reason = prompt("Please describe the issue:");
//   if (!reason) return;

//   const {
//     data: { user },
//   } = await supabase.auth.getUser();

//   // Fetch freelancer ID from hire
//   const { data: hire } = await supabase
//     .from("hires")
//     .select("freelancer_id")
//     .eq("id", hireId)
//     .single();

//   const { error } = await supabase.from("disputes").insert({
//     hire_id: hireId,
//     client_id: user.id,
//     freelancer_id: hire.freelancer_id,
//     reason,
//     status: "open",
//   });

//   if (error) {
//     console.error(error);
//     alert("Failed to submit dispute.");
//     return;
//   }

//   // Freeze coin by marking hold as disputed
//   await supabase
//     .from("coin_holds")
//     .update({ status: "disputed" })
//     .eq("hire_id", hireId);

//   alert("⚠️ Dispute raised! Our admin will review soon.");
//   loadPendingReviews();
// }


function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


