import { supabase } from "../../supabase/config.js";


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

const resultsDiv = document.getElementById("results");

// Load users awaiting verification
export async function loadPendingUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email, role, gov_id_path")
    .eq("verified", false);

  if (error) {
    resultsDiv.innerHTML = "Error loading users.";
    console.error(error);
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending Users</h2>";

  if (!data || data.length === 0) {
    resultsDiv.innerHTML += "<p>No pending users.</p>";
    return;
  }

  for (const user of data) {
    let idUrl = null;

    if (user.gov_id_path) {
      // choose the correct bucket based on role
      const bucket = "id_verifications";

      const { data: urlData, error: urlErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(user.gov_id_path, 60);

      if (!urlErr) {
        idUrl = urlData.signedUrl;
      }
    }

    resultsDiv.innerHTML += `
      <div class="card">
        <p><b>${user.full_name}</b> (${user.role})</p>
        <p>Email: ${user.email}</p>
        ${
          idUrl
            ? `<p><a href="${idUrl}" target="_blank">View ID Document</a></p>`
            : `<p><i>No ID uploaded</i></p>`
        }
        <button onclick="verifyUser('${user.id}')">Verify</button>
      </div>
    `;
  }
}


// Verify user
window.verifyUser = async function (userId) {
  const { error } = await supabase
    .from("users")
    .update({ verified: true })
    .eq("id", userId);

  if (error) {
    alert("Verification failed: " + error.message);
  } else {
    alert("User verified!");
    loadPendingUsers();
  }
};


// Load jobs awaiting approval
export async function loadPendingJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select(`
      *,
      milestones (
        id,
        title,
        amount,
        sequence,
        description
      )
    `)
    .eq("approved", false);

  if (error) {
    resultsDiv.innerHTML = "Error loading jobs.";
    console.error("Error loading pending jobs:", error);
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending Jobs</h2>";
  
  if (!data || data.length === 0) {
    resultsDiv.innerHTML += "<p>No pending jobs for approval.</p>";
    return;
  }

  data.forEach(job => {
    // Determine payment type and format accordingly
    const paymentType = job.payment_type || 'single';
    const paymentTypeBadge = paymentType === 'milestone' 
      ? '<span style="background: #ffd700; color: #000; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">💰 Milestone-based</span>'
      : '<span style="background: #007bff; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-left: 8px;">💳 Single Payment</span>';

    let milestonesHTML = '';
    
    if (paymentType === 'milestone' && job.milestones && job.milestones.length > 0) {
      milestonesHTML = `
        <div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
          <strong>📋 Milestones:</strong>
          <div style="margin-top: 8px;">
            ${job.milestones
              .sort((a, b) => a.sequence - b.sequence)
              .map(milestone => `
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px; padding: 6px; background: white; border-radius: 4px;">
                  <div style="flex: 1;">
                    <strong>${milestone.sequence}. ${milestone.title}</strong>
                    <div style="font-size: 12px; color: #666; margin-top: 2px;">${milestone.description}</div>
                  </div>
                  <div style="font-weight: bold; color: #28a745; margin-left: 10px;">
                    $${milestone.amount}
                  </div>
                </div>
              `).join('')}
          </div>
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; font-weight: bold;">
            Total Budget: $${job.budget}
          </div>
        </div>
      `;
    } else {
      milestonesHTML = `
        <div style="margin-top: 8px;">
          <strong>Budget:</strong> $${job.budget}
        </div>
      `;
    }

    // Format required skills
    let skillsHTML = '';
    if (job.required_skill_ids && job.required_skill_ids.length > 0) {
      skillsHTML = `
        <div style="margin-top: 8px;">
          <strong>Required Skills:</strong> ${job.required_skill_ids.length} skill(s)
        </div>
      `;
    }

    resultsDiv.innerHTML += `
      <div class="card" style="margin-bottom: 16px; padding: 16px;">
        <div style="display: flex; justify-content: between; align-items: flex-start;">
          <div style="flex: 1;">
            <h3 style="margin: 0 0 8px 0; display: flex; align-items: center;">
              ${job.title}
              ${paymentTypeBadge}
            </h3>
            <p style="margin: 0 0 8px 0; color: #666;">${job.description}</p>
            
            ${milestonesHTML}
            ${skillsHTML}
            
            <div style="margin-top: 12px; font-size: 12px; color: #888;">
              <div><strong>Preferred Tone:</strong> ${job.preferred_tone || 'Not specified'}</div>
              <div><strong>Language:</strong> ${job.language || 'English'}</div>
              <div><strong>Deadline:</strong> ${job.deadline ? new Date(job.deadline).toLocaleDateString() : 'Not set'}</div>
            </div>
          </div>
        </div>
        
        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button 
            onclick="approveJob('${job.id}')" 
            style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;"
          >
            ✅ Approve Job
          </button>
          <button 
            onclick="viewJobDetails('${job.id}')" 
            style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;"
          >
            🔍 View Details
          </button>
        </div>
      </div>
    `;
  });
}

// Optional: Add a view details function for more comprehensive job info
window.viewJobDetails = async function(jobId) {
  const { data: job, error } = await supabase
    .from("jobs")
    .select(`
      *,
      milestones (
        id,
        title,
        amount,
        sequence,
        description,
        status
      ),
      users!jobs_client_id_fkey(full_name, email)
    `)
    .eq("id", jobId)
    .single();

  if (error) {
    alert("Error loading job details: " + error.message);
    return;
  }

  const paymentType = job.payment_type || 'single';
  
  let modalContent = `
    <div style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
      <h2>Job Details: ${job.title}</h2>
      <div style="margin-bottom: 16px;">
        <strong>Posted by:</strong> ${job.users?.full_name || 'Unknown'} (${job.users?.email || 'No email'})
      </div>
      <div style="margin-bottom: 16px;">
        <strong>Description:</strong>
        <p>${job.description}</p>
      </div>
      <div style="margin-bottom: 16px;">
        <strong>Expected Outcome:</strong>
        <p>${job.expected_outcome || 'Not specified'}</p>
      </div>
      <div style="margin-bottom: 16px;">
        <strong>Payment Type:</strong> ${paymentType === 'milestone' ? '💰 Milestone-based' : '💳 Single Payment'}
      </div>
  `;

  if (paymentType === 'milestone' && job.milestones && job.milestones.length > 0) {
    modalContent += `
      <div style="margin-bottom: 16px;">
        <strong>Project Milestones:</strong>
        ${job.milestones
          .sort((a, b) => a.sequence - b.sequence)
          .map(milestone => `
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin: 8px 0; background: #f8f9fa;">
              <div style="display: flex; justify-content: between; align-items: flex-start;">
                <div style="flex: 1;">
                  <h4 style="margin: 0 0 4px 0;">${milestone.sequence}. ${milestone.title}</h4>
                  <p style="margin: 0 0 8px 0; color: #666;">${milestone.description}</p>
                </div>
                <div style="font-weight: bold; color: #28a745; font-size: 16px;">
                  $${milestone.amount}
                </div>
              </div>
            </div>
          `).join('')}
        <div style="text-align: right; font-weight: bold; font-size: 16px; margin-top: 8px;">
          Total: $${job.budget}
        </div>
      </div>
    `;
  } else {
    modalContent += `
      <div style="margin-bottom: 16px;">
        <strong>Budget:</strong> $${job.budget}
      </div>
    `;
  }

  modalContent += `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
      <div><strong>Preferred Tone:</strong><br>${job.preferred_tone || 'Not specified'}</div>
      <div><strong>Language:</strong><br>${job.language || 'English'}</div>
      <div><strong>Deadline:</strong><br>${job.deadline ? new Date(job.deadline).toLocaleDateString() : 'Not set'}</div>
      <div><strong>Required Skills:</strong><br>${job.required_skill_ids?.length || 0} skills</div>
    </div>
    
    <div style="text-align: center; margin-top: 20px;">
      <button 
        onclick="approveJob('${job.id}')" 
        style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-right: 8px;"
      >
        ✅ Approve Job
      </button>
      <button 
        onclick="closeModal()" 
        style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;"
      >
        Close
      </button>
    </div>
  </div>
  `;

  // Simple modal implementation
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
    background: rgba(0,0,0,0.5); display: flex; align-items: center; 
    justify-content: center; z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 8px; width: 90%; max-width: 700px;">
      ${modalContent}
    </div>
  `;
  
  modal.onclick = (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  };
  
  document.body.appendChild(modal);
}

// Helper function to close modal
window.closeModal = function() {
  const modal = document.querySelector('div[style*="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5)"]');
  if (modal) {
    document.body.removeChild(modal);
  }
};

// Approve job
import { runMatching } from "./matching.js";

window.approveJob = async function(jobId) {
  const { error } = await supabase
    .from("jobs")
    .update({ approved: true })
    .eq("id", jobId);

  if (error) {
    alert("Approval failed: " + error.message);
  } else {
    // ✅ Run matching after approval
    await runMatching(jobId);
    console.log("Running matching for job ID:", jobId);
    alert("Job approved and matching started!");
    loadPendingJobs();
  }
};


// Load success fees awaiting confirmation
export async function loadPendingFees() {
  const { data, error } = await supabase
    .from("success_fees")
    .select("*")
    .eq("paid", true)
    .eq("admin_confirmed", false);

  if (error) {
    resultsDiv.innerHTML = "Error loading fees.";
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending Fees</h2>";
  data.forEach(fee => {
    resultsDiv.innerHTML += `
      <div class="card">
        <p>Freelancer: ${fee.freelancer_id}</p>
        <p>Job: ${fee.job_id}</p>
        <p>Amount: $${fee.amount}</p>
        <button onclick="confirmFee('${fee.id}')">Confirm Fee</button>
      </div>
    `;
  });
}

// Confirm fee
window.confirmFee = async function(feeId) {
  const { error } = await supabase
    .from("success_fees")
    .update({ admin_confirmed: true })
    .eq("id", feeId);

  if (error) {
    alert("Fee confirmation failed: " + error.message);
  } else {
    alert("Fee confirmed!");
    loadPendingFees();
  }
};

// Load job matches awaiting approval
export async function loadPendingMatches() {
  const { data, error } = await supabase
    .from("job_matches")
    .select(`
      id,
      score,
      approved,
      jobs(title, description),
      users(full_name, tone, language)
    `)
    .eq("approved", false);

  if (error) {
    resultsDiv.innerHTML = "Error loading matches.";
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending Matches</h2>";

  if (data.length === 0) {
    resultsDiv.innerHTML += "<p>No pending matches.</p>";
    return;
  }

  data.forEach(match => {
    resultsDiv.innerHTML += `
      <div class="card">
        <h3>Job: ${match.jobs.title}</h3>
        <p>${match.jobs.description}</p>
        <hr>
        <p><b>Freelancer:</b> ${match.users.full_name}</p>
        <p>Tone: ${match.users.tone}, Language: ${match.users.language}</p>
        <p>Score: ${match.score}</p>
        <button onclick="approveMatch(${match.id})">Approve</button>
        <button onclick="rejectMatch(${match.id})">Reject</button>
      </div>
    `;
  });
}

// Approve match
window.approveMatch = async function(matchId) {
  const { error } = await supabase
    .from("job_matches")
    .update({ approved: true })
    .eq("id", matchId);

  if (error) {
    alert("Approval failed: " + error.message);
  } else {
    alert("Match approved!");
    loadPendingMatches();
  }
};

// Reject match
window.rejectMatch = async function(matchId) {
  const { error } = await supabase
    .from("job_matches")
    .delete()
    .eq("id", matchId);

  if (error) {
    alert("Rejection failed: " + error.message);
  } else {
    alert("Match rejected!");
    loadPendingMatches();
  }
};


document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnUsers").addEventListener("click", loadPendingUsers);
  document.getElementById("btnJobs").addEventListener("click", loadPendingJobs);
  document.getElementById("btnFees").addEventListener("click", loadPendingFees);
  document.getElementById("btnMatch").addEventListener("click", loadPendingMatches);
  document.getElementById("btnIdVerifications").addEventListener("click", loadPendingIdVerifications);
});


// ADMIN: confirm release and mark completed
export async function adminConfirmRelease(contractId) {
  // Fetch the contract
  const { data: contract, error: fetchErr } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (fetchErr) {
    console.error("Failed to fetch contract:", fetchErr.message);
    throw fetchErr;
  }

  // Update contract status
  const { error: updErr } = await supabase
    .from("contracts")
    .update({
      admin_confirmed: true,
      status: "released"
    })
    .eq("id", contractId);

  if (updErr) {
    console.error("Failed to update contract:", updErr.message);
    throw updErr;
  }

  // Log payment in payments table
  const { error: payErr } = await supabase.from("payments").insert({
    job_id: contract.hire_id,           // if payments.job_id is uuid, this matches since hire_id is uuid
    client_id: contract.client_id,
    freelancer_id: contract.freelancer_id,
    amount: contract.total_amount,
    method: contract.payment_method,
    client_marked_sent: contract.client_marked_sent,
    freelancer_marked_received: contract.freelancer_marked_received
  });

  if (payErr) {
    console.warn("Payment log insert issue:", payErr.message);
  }

  // Notify freelancer & client
  await supabase.from("notifications").insert([
    {
      user_id: contract.freelancer_id,
      type: "payment",
      message: `Admin confirmed release for contract ${contractId}`
    },
    {
      user_id: contract.client_id,
      type: "payment",
      message: `Admin confirmed release for contract ${contractId}`
    }
  ]);

  return true;
}


// admin.js

export async function loadPendingPaymentDetails() {
  const { data, error } = await supabase
    .from('contract_payment_details')
    .select('id, contract_id, freelancer_id, payment_method, details, proof_url, verified, created_at, contracts(client_id, total_amount)')
    .eq('verified', false)
    .order('created_at', { ascending: true });

  const results = document.getElementById('adminPaymentDetails');
  if (error) { results.innerHTML = 'Error'; console.error(error); return; }
  if (!data || data.length === 0) { results.innerHTML = '<p>No pending payment details</p>'; return; }

  results.innerHTML = '';
  data.forEach(d => {
    const div = document.createElement('div');
    div.classList.add('card');
    div.innerHTML = `
      <p><b>Contract:</b> ${d.contract_id} — Amount: ${d.contracts?.total_amount || ''}</p>
      <p><b>Freelancer:</b> ${d.freelancer_id}</p>
      <p><b>Method:</b> ${d.payment_method}</p>
      <pre>${JSON.stringify(d.details, null, 2)}</pre>
      ${d.proof_url ? `<a href="${d.proof_url}" target="_blank">View Proof</a>` : ''}
      <button class="verify-btn" data-id="${d.id}">Verify Details</button>
    `;
    results.appendChild(div);
  });

  // attach listeners
  document.querySelectorAll('.verify-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      await verifyPaymentDetails(id);
      loadPendingPaymentDetails();
    });
  });
}

export async function verifyPaymentDetails(id) {
  const { error } = await supabase
    .from('contract_payment_details')
    .update({ verified: true })
    .eq('id', id);

  if (error) {
    console.error('Verify failed', error);
  } else {
    // notify client & freelancer
    const { data } = await supabase.from('contract_payment_details').select('contract_id, freelancer_id').eq('id', id).single();
    const { data: contract } = await supabase.from('contracts').select('client_id').eq('id', data.contract_id).single();
    if (contract?.client_id) {
      await supabase.from('notifications').insert({
        user_id: contract.client_id,
        type: 'info',
        message: `Admin verified freelancer payment details for contract ${data.contract_id}.`
      });
    }
    await supabase.from('notifications').insert({
      user_id: data.freelancer_id,
      type: 'info',
      message: `Admin verified your payment details for contract ${data.contract_id}.`
    });
  }
}


document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("adminPaymentDetails")) {
    loadPendingPaymentDetails();
  }
});


export async function loadContractsAwaitingRelease() {
  const { data, error } = await supabase
    .from("contracts")
    .select("id, total_amount, currency, client_id, freelancer_id, status, proof_url, created_at")
    .eq("status", "payment_sent")
    .order("created_at", { ascending: true });

  const container = document.getElementById("adminContractsList");
  if (error) {
    container.innerHTML = "<p>Error loading contracts</p>";
    console.error(error);
    return;
  }
  if (!data || data.length === 0) {
    container.innerHTML = "<p>No contracts awaiting release.</p>";
    return;
  }

  container.innerHTML = "";
  data.forEach(c => {
    const div = document.createElement("div");
    div.classList.add("card");
    div.innerHTML = `
      <p><b>Contract ID:</b> ${c.id}</p>
      <p><b>Amount:</b> ${c.total_amount} ${c.currency}</p>
      <p><b>Status:</b> ${c.status}</p>
      ${c.proof_url ? `<p><b>Proof:</b> <a href="${c.proof_url}" target="_blank">View</a></p>` : ""}
      <button class="confirm-release-btn" data-id="${c.id}">Confirm Release</button>
    `;
    container.appendChild(div);
  });

  // attach listeners
  document.querySelectorAll(".confirm-release-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      try {
        await adminConfirmRelease(id);
        alert("Contract released successfully.");
        loadContractsAwaitingRelease(); // refresh list
      } catch (err) {
        alert("Error: " + err.message);
      }
    });
  });
}


document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("adminContractsList")) {
    loadContractsAwaitingRelease();
  }
});


// Load pending ID verifications
export async function loadPendingIdVerifications() {
  const resultsDiv = document.getElementById("results");
  
  const { data, error } = await supabase
    .from("users")
    .select(`
      id,
      full_name,
      email,
      role,
      gov_id_path,
      created_at,
      id_rejection_reason
    `)
    .eq("id_verified", false)
    .not("gov_id_path", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    resultsDiv.innerHTML = "Error loading ID verifications.";
    console.error(error);
    return;
  }

  resultsDiv.innerHTML = "<h2>Pending ID Verifications</h2>";

  if (!data || data.length === 0) {
    resultsDiv.innerHTML += "<p>No pending ID verifications.</p>";
    return;
  }

  for (const user of data) {
    let idUrl = null;

    if (user.gov_id_path) {
      // Choose the correct bucket based on role
      const bucket = "id_verifications";
      
      const { data: urlData, error: urlErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(user.gov_id_path, 60); // 1 minute expiry

      if (!urlErr) {
        idUrl = urlData.signedUrl;
      }
    }

    resultsDiv.innerHTML += `
      <div class="card">
        <div class="user-info">
          <p><b>${user.full_name}</b> (${user.role})</p>
          <p>Email: ${user.email}</p>
          <p>Submitted: ${new Date(user.created_at).toLocaleString()}</p>
          ${user.id_rejection_reason ? `
            <p class="rejection-reason"><b>Previous Rejection:</b> ${user.id_rejection_reason}</p>
          ` : ''}
        </div>
        
        <div class="id-preview">
          ${idUrl ? `
            <p><a href="${idUrl}" target="_blank" class="view-id-link">📄 View ID Document</a></p>
          ` : `
            <p><i>ID document not accessible</i></p>
          `}
        </div>
        
        <div class="verification-actions">
          <button class="btn-approve" onclick="approveIdVerification('${user.id}')">
            ✅ Approve
          </button>
          <button class="btn-reject" onclick="showRejectionModal('${user.id}', '${user.full_name}')">
            ❌ Reject
          </button>
        </div>
      </div>
    `;
  }
}

// Approve ID verification
window.approveIdVerification = async function (userId) {
  const { error } = await supabase
    .from("users")
    .update({ 
      id_verified: true,
      verified: true,
      id_rejection_reason: null
    })
    .eq("id", userId);

  if (error) {
    alert("Approval failed: " + error.message);
    return;
  }

  // Notify user
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "verification",
    message: "Your ID has been verified! You can now use all platform features."
  });

  alert("ID approved successfully!");
  loadPendingIdVerifications(); // Refresh the list
};

// Show rejection modal
window.showRejectionModal = function (userId, userName) {
  const reason = prompt(`Enter rejection reason for ${userName}:`, 
    "ID document unclear, please upload a clearer image");
  
  if (reason === null) return; // User cancelled
  
  if (!reason.trim()) {
    alert("Please provide a rejection reason.");
    return;
  }

  rejectIdVerification(userId, reason.trim());
};

// Reject ID verification
async function rejectIdVerification(userId, reason) {
  const { error } = await supabase
    .from("users")
    .update({ 
      gov_id_path: null,
      id_rejection_reason: reason
    })
    .eq("id", userId);

  if (error) {
    alert("Rejection failed: " + error.message);
    return;
  }

  // Notify user
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "verification",
    message: `Your ID was rejected: ${reason}. Please upload a new ID document.`
  });

  alert("ID rejected successfully!");
  loadPendingIdVerifications(); // Refresh the list
}