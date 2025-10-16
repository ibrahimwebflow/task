import { supabase } from "../../supabase/config.js";

const availabilityBtn = document.getElementById("toggleAvailability");
const statusText = document.getElementById("availabilityStatus");
const portfolioForm = document.getElementById("portfolioForm");
const portfolioList = document.getElementById("portfolioList");
const matchedJobsDiv = document.getElementById("matchedJobs");

// Get logged-in freelancer
async function getFreelancer() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    alert("Not logged in.");
    window.location.href = "login.html";
    return null;
  }
  return user;
}

// Load availability
async function toggleAvailability() {
  const freelancer = await getFreelancer();
  if (!freelancer) return;

  // ✅ NEW: Check ID verification first
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("available, id_verified, gov_id_path")
    .eq("id", freelancer.id)
    .single();

  if (userError) {
    console.error("Error fetching user data:", userError);
    return;
  }

  // Check if ID is verified
  if (!userData.id_verified) {
    if (!userData.gov_id_path) {
      alert("❌ Please upload your government ID in settings before making yourself available for work.");
      window.location.href = "settings.html"; // Redirect to settings
    } else {
      alert("⏳ Your ID is pending admin verification. You'll be available once verified.");
    }
    return;
  }

  const newStatus = !userData.available;

  // If turning ON, check unpaid fees
  if (newStatus === true) {
    const { data: unpaid, error: feeErr } = await supabase
      .from("platform_fees")
      .select("id, contract_id, fee_amount, status")
      .eq("freelancer_id", freelancer.id)
      .neq("status", "paid");
    
    if (feeErr) { console.error(feeErr); }
    if (unpaid && unpaid.length > 0) {
      const totalDue = unpaid.reduce((s, f) => s + Number(f.fee_amount || 0), 0).toFixed(2);
      alert(`You have outstanding platform fees totaling ${totalDue}. Pay them to become available again.`);
      window.location.href = "/freelancer/fees.html";
      return;
    }
  }

  // No unpaid fees or toggling off → proceed
  const { error: updErr } = await supabase
    .from("users")
    .update({ available: newStatus })
    .eq("id", freelancer.id);

  if (updErr) {
    console.error("Failed to update availability:", updErr);
    alert("Failed to change availability.");
    return;
  }
  loadAvailability();
}

// Updated loadAvailability for toggle styling
async function loadAvailability() {
  const freelancer = await getFreelancer();
  if (!freelancer) return;

  const { data, error } = await supabase
    .from("users")
    .select("available, id_verified")
    .eq("id", freelancer.id)
    .single();

  if (error) return;

  // For toggle switch (blue ball)
  const toggle = document.getElementById("availabilityToggle"); // You'll need to add this
  if (toggle) {
    toggle.checked = data.available;
    
    // Disable toggle if not ID verified
    toggle.disabled = !data.id_verified;
    if (!data.id_verified) {
      toggle.title = "Complete ID verification to toggle availability";
    }
  }
}



// Placeholder for matched jobs (later will plug AI matching)
/**
 * MATCHED JOBS
 */
async function loadMatchedJobs() {
  const freelancer = await getFreelancer();
  if (!freelancer) return;

  const container = document.getElementById("matchedJobs");
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading matched jobs...</div>';

  const { data, error } = await supabase
    .from("job_matches")
    .select(`
      id,
      score,
      jobs(
        id, title, description, created_at, client_id, payment_type, budget,
        hires(id)
      ),
      clients:jobs!inner(client_id, users(full_name))
    `)
    .eq("freelancer_id", freelancer.id)
    .order("score", { ascending: false });

  if (error) {
    container.innerHTML = '<p class="error">Error loading matched jobs.</p>';
    console.error(error);
    return;
  }

  // Filter: remove jobs that already have hires
  const filtered = (data || []).filter(m => {
    return !m.jobs.hires || m.jobs.hires.length === 0;
  });

  container.innerHTML = '<div class="jobs-grid"></div>';
  const jobsGrid = container.querySelector(".jobs-grid");

  if (filtered.length === 0) {
    jobsGrid.innerHTML = `
      <div class="empty-jobs">
        <h3>No Active Job Matches</h3>
        <p>All your matched jobs are either completed or awaiting new openings.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((match, index) => {
    const job = match.jobs;
    
    // NEW: Payment type badge
    const paymentTypeBadge = job.payment_type === 'milestone' 
      ? '<span class="badge milestone-badge">💰 Milestone Payments</span>'
      : '<span class="badge single-badge">💳 Single Payment</span>';
    
    // NEW: Budget display
    const budgetDisplay = job.payment_type === 'milestone' 
      ? `<div class="meta-item">
           <span class="meta-label">Total Budget</span>
           <span class="meta-value">$${job.budget}</span>
         </div>`
      : `<div class="meta-item">
           <span class="meta-label">Budget</span>
           <span class="meta-value">$${job.budget}</span>
         </div>`;

    const jobCard = document.createElement("div");
    jobCard.className = "job-card";
    jobCard.style.animationDelay = `${index * 0.1}s`;

    jobCard.innerHTML = `
      <div class="job-header">
        <h3 class="job-title">${job.title}</h3>
        <span class="match-badge">${Math.round(match.score)}% Match</span>
      </div>
      
      <div class="job-description">
        ${job.description}
      </div>
      
      ${paymentTypeBadge}
      
      <div class="job-meta">
        <div class="meta-item">
          <span class="meta-label">Posted</span>
          <span class="meta-value">${new Date(job.created_at).toLocaleDateString()}</span>
        </div>
        ${budgetDisplay}
        ${match.clients?.users ? `
          <div class="meta-item">
            <span class="meta-label">Client</span>
            <span class="meta-value">${match.clients.users.full_name}</span>
          </div>
        ` : ""}
      </div>
      
      <div class="job-status">
        <span class="status-icon">✅</span>
        <div>
          <div class="status-text">You've Been Matched!</div>
          <div class="status-note">Awaiting client hire decision</div>
        </div>
      </div>
    `;

    jobsGrid.appendChild(jobCard);
  });
}

async function loadHires() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const hiresList = document.getElementById("hiresList");

  if (error || !user) {
    hiresList.innerHTML = "<p>You must be logged in.</p>";
    return;
  }

  // Fetch all hires for the freelancer
  const { data: hires, error: hiresError } = await supabase
    .from("hires")
    .select(`
      id,
      job_id,
      created_at,
      jobs (id, title, description, deadline, payment_type, budget),
      users!hires_client_id_fkey (full_name)
    `)
    .eq("freelancer_id", user.id)
    .order("created_at", { ascending: false });

  if (hiresError) {
    hiresList.innerHTML = "<p>Error loading hires.</p>";
    console.error(hiresError);
    return;
  }

  if (!hires || hires.length === 0) {
    hiresList.innerHTML = "<p>No active jobs yet.</p>";
    return;
  }

  // Get coin holds data for single payment jobs
  const hireIds = hires.map(h => h.id);
  const { data: coinHolds, error: coinHoldsError } = await supabase
    .from("coin_holds")
    .select("hire_id, status")
    .in("hire_id", hireIds)
    .is("milestone_id", null); // Only get coin holds for single payments

  if (coinHoldsError) {
    console.error("Coin holds query error:", coinHoldsError);
  }

  // Create a map of hire_id to coin_hold status for single payment jobs
  const coinHoldStatusMap = {};
  coinHolds?.forEach(hold => {
    coinHoldStatusMap[hold.hire_id] = hold.status;
  });

  // Get milestones data for milestone payment jobs
  const milestoneJobIds = hires
    .filter(h => h.jobs.payment_type === 'milestone')
    .map(h => h.job_id);

  let milestonesData = [];
  if (milestoneJobIds.length > 0) {
    const { data: milestones, error: milestonesError } = await supabase
      .from("milestones")
      .select("job_id, status")
      .in("job_id", milestoneJobIds);

    if (milestonesError) {
      console.error("Milestones query error:", milestonesError);
    } else {
      milestonesData = milestones || [];
    }
  }

  // Group milestones by job_id and check if all are approved
  const milestonesByJob = {};
  milestonesData.forEach(milestone => {
    if (!milestonesByJob[milestone.job_id]) {
      milestonesByJob[milestone.job_id] = [];
    }
    milestonesByJob[milestone.job_id].push(milestone.status);
  });

  // Filter hires based on the same criteria as client side
  const filteredHires = hires.filter(hire => {
    if (hire.jobs.payment_type === 'single') {
      // For single payment: only show if coin hold is NOT released or refunded
      const coinHoldStatus = coinHoldStatusMap[hire.id];
      return coinHoldStatus !== 'released' && coinHoldStatus !== 'refunded';
    } else if (hire.jobs.payment_type === 'milestone') {
      // For milestone payment: only show if NOT all milestones are approved
      const jobMilestones = milestonesByJob[hire.job_id] || [];
      if (jobMilestones.length === 0) {
        // If no milestones found, show the hire (might be newly created)
        return true;
      }
      // Check if ALL milestones are approved
      const allApproved = jobMilestones.every(status => status === 'approved');
      return !allApproved; // Show if NOT all approved
    }
    // Default: show the hire if payment type is unknown
    return true;
  });

  if (filteredHires.length === 0) {
    hiresList.innerHTML = "<p>No active jobs. All projects have been completed!</p>";
    return;
  }

  // Render the filtered hires
  hiresList.innerHTML = "";
  
  // Helper functions (keep your existing ones)
  const getDeadlineSectionClass = (daysDiff) => {
    if (daysDiff > 5) return 'green';
    if (daysDiff > 0 && daysDiff <= 5) return 'yellow';
    if (daysDiff === 0) return 'orange';
    return 'red';
  };

  const getProgressBarClass = (daysDiff) => {
    if (daysDiff > 5) return 'progress-green';
    if (daysDiff > 0 && daysDiff <= 5) return 'progress-yellow';
    if (daysDiff === 0) return 'progress-orange';
    return 'progress-red';
  };

  const getDaysText = (daysDiff) => {
    if (daysDiff > 5) return `${daysDiff} days remaining`;
    if (daysDiff > 0 && daysDiff <= 5) return `${daysDiff} days left`;
    if (daysDiff === 0) return 'Due today';
    return `${Math.abs(daysDiff)} days overdue`;
  };

  const calculateProgressWidth = (daysDiff, deadlineDate) => {
    if (!deadlineDate || daysDiff < 0) return 100;
    
    const totalDuration = 14; // Assume 14-day project for progress calculation
    const daysPassed = totalDuration - daysDiff;
    const progress = (daysPassed / totalDuration) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  const getDeadlineHighlight = (daysDiff) => {
    if (daysDiff > 5) {
      return `<span class="badge badge-green">🟢 ${daysDiff} days remaining</span>`;
    } else if (daysDiff > 0 && daysDiff <= 5) {
      return `<span class="badge badge-yellow">🟡 ${daysDiff} days left — getting close!</span>`;
    } else if (daysDiff === 0) {
      return `<span class="badge badge-orange">🟠 Deadline is today!</span>`;
    } else {
      return `<span class="badge badge-red">🔴 Overdue by ${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? "s" : ""}</span>`;
    }
  };

  filteredHires.forEach((hire) => {
    const deadlineDate = hire.jobs.deadline ? new Date(hire.jobs.deadline) : null;
    const now = new Date();

    let deadlineText = "No deadline set";
    let daysDiff = null;

    if (deadlineDate) {
      daysDiff = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      deadlineText = deadlineDate.toLocaleDateString();
    }

    // Payment type info with progress status
    let paymentTypeInfo = '';
    if (hire.jobs.payment_type === 'milestone') {
      const jobMilestones = milestonesByJob[hire.job_id] || [];
      const approvedCount = jobMilestones.filter(status => status === 'approved').length;
      const totalCount = jobMilestones.length;
      
      paymentTypeInfo = `
        <div class="payment-info">
          <span class="badge milestone-badge">💰 Milestone-based Project</span>
          <small>Progress: ${approvedCount}/${totalCount} milestones completed • Total Budget: $${hire.jobs.budget}</small>
        </div>
      `;
    } else {
      const coinHoldStatus = coinHoldStatusMap[hire.id] || 'held';
      paymentTypeInfo = `
        <div class="payment-info">
          <span class="badge single-badge">💳 Single Payment</span>
          <small>Budget: $${hire.jobs.budget} • Payment Status: ${coinHoldStatus}</small>
        </div>
      `;
    }

    // Generate the deadline highlight HTML
    const deadlineHighlight = daysDiff !== null ? getDeadlineHighlight(daysDiff) : '';

    hiresList.innerHTML += `
      <div class="card">
        <h3>${hire.jobs.title}</h3>
        <p>${hire.jobs.description}</p>
        
        ${paymentTypeInfo}
        
        ${deadlineDate ? `
          <div class="deadline-section ${getDeadlineSectionClass(daysDiff)}">
            <div class="deadline-info">
              <span class="deadline-date">📅 ${deadlineText}</span>
              <span class="deadline-days">${getDaysText(daysDiff)}</span>
            </div>
            ${deadlineHighlight}
            <div class="deadline-progress">
              <div class="progress-bar ${getProgressBarClass(daysDiff)}" style="width: ${calculateProgressWidth(daysDiff, deadlineDate)}%"></div>
            </div>
          </div>
        ` : `
          <div class="deadline-section">
            <div class="deadline-info">
              <span class="deadline-date">📅 ${deadlineText}</span>
            </div>
            <span class="badge">No deadline set</span>
          </div>
        `}
        
        <p><b>Client:</b> ${hire.users.full_name}</p>
        <small>Hired on ${new Date(hire.created_at).toLocaleString()}</small>
        
        <div class="card-actions">
          <button onclick="window.location.href='../chat/chat.html?hire=${hire.id}'">
            💬 Chat with Client
          </button>
          ${hire.jobs.payment_type === 'milestone' ? `
            <button onclick="window.location.href='milestones.html?hire=${hire.id}'">
              📋 Manage Milestones
            </button>
          ` : `
            <button onclick="window.location.href='final-submissions.html?hire=${hire.id}'">
              🚀 Submit Final Work
            </button>
          `}
        </div>
      </div>
    `;
  });
}

// Update the viewMilestones function to actually navigate
function viewMilestones(hireId) {
  window.location.href = `milestones.html?hire=${hireId}`;
}

// NEW: Function to view milestones (to be implemented)
// function viewMilestones(hireId) {
//   // This will be implemented in the milestone submission system
//   console.log("View milestones for hire:", hireId);
//   // Will navigate to milestones page or show modal
//   alert("Milestone system coming soon! For now, use chat to coordinate with client.");
// }

// Init
document.addEventListener("DOMContentLoaded", () => {
  loadAvailability();
  loadMatchedJobs();
  loadHires(); // Make sure this is called

  if (availabilityBtn) availabilityBtn.addEventListener("click", toggleAvailability);
  if (portfolioForm) portfolioForm.addEventListener("submit", handlePortfolioUpload);
});



async function loadNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = document.getElementById("notificationsList");
  if (error || !data || data.length === 0) {
    list.innerHTML = "<li>No notifications</li>";
    return;
  }

  list.innerHTML = "";
  data.forEach(n => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${n.message}
      <button class="dismiss-btn" data-id="${n.id}">Dismiss</button>
    `;
    list.appendChild(li);
  });

  // Attach event listeners to dismiss buttons
  document.querySelectorAll(".dismiss-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await deleteNotification(id);
      e.target.parentElement.remove();
    });
  });
}


// Real-time subscription
function subscribeToNotifications(userId) {
  supabase
    .channel("notifications-" + userId)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      payload => {
        const list = document.getElementById("notificationsList");
        const n = payload.new;

        const li = document.createElement("li");
        li.innerHTML = `
          ${n.message}
          <button class="dismiss-btn" data-id="${n.id}">Dismiss</button>
        `;

        li.querySelector(".dismiss-btn").addEventListener("click", async (e) => {
          await deleteNotification(n.id);
          e.target.parentElement.remove();
        });

        list.prepend(li);
      }
    )
    .subscribe();
}


async function deleteNotification(id) {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete notification:", error.message);
  }
}


// Init
document.addEventListener("DOMContentLoaded", async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    loadNotifications();
    subscribeToNotifications(user.id);
  }
});


// FREELANCER: mark received
export async function markReceived(contractId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const { error } = await supabase.from('contracts').update({
    freelancer_marked_received: true,
    status: 'payment_sent'  // still payment_sent until admin confirms release
  }).eq('id', contractId);

  if (error) throw error;

  // notify admin
  // (Assuming admin user(s) have role='admin' in users)
  const { data: admins } = await supabase.from('users').select('id').eq('role','admin');
  for (const a of admins || []) {
    await supabase.from('notifications').insert({
      user_id: a.id,
      type: 'payment',
      message: `Freelancer marked payment received for contract ${contractId}`
    });
  }
  return true;
}

async function loadContractForFreelancer() {
  const params = new URLSearchParams(window.location.search);
  const contractId = params.get('contract');
  if (!contractId) return;

  // get contract and show client-chosen payment_method
  const { data: contract, error } = await supabase
    .from('contracts')
    .select('id, payment_method, client_id, total_amount, freelancer_id')
    .eq('id', contractId)
    .single();
  if (error) {
    console.error(error);
    return;
  }

  document.getElementById('contractPaymentMethod').value = contract.payment_method;

  // show appropriate fields
  if (contract.payment_method === 'bank_transfer') {
    document.getElementById('bankFields').style.display = 'block';
  } else if (contract.payment_method === 'crypto') {
    document.getElementById('cryptoFields').style.display = 'block';
  }

  // attach submit listener
  const form = document.getElementById('paymentDetailsForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitPaymentDetails(contractId);
  });
}

async function submitPaymentDetails(contractId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    alert('Login required');
    return;
  }

  // fetch contract to confirm freelancer is owner
  const { data: c, error: cErr } = await supabase.from('contracts').select('freelancer_id, payment_method').eq('id', contractId).single();
  if (cErr) { console.error(cErr); alert('Contract load error'); return; }
  if (c.freelancer_id !== user.id) { alert('Not authorized for this contract'); return; }

  const paymentMethod = c.payment_method;
  let details = {};

  if (paymentMethod === 'bank_transfer') {
    details.bank_name = document.querySelector('input[name="bank_name"]').value.trim();
    details.account_name = document.querySelector('input[name="account_name"]').value.trim();
    details.account_number = document.querySelector('input[name="account_number"]').value.trim();
    details.swift = document.querySelector('input[name="swift"]').value.trim();
  } else if (paymentMethod === 'crypto') {
    details.crypto_network = document.querySelector('input[name="crypto_network"]').value.trim();
    details.address = document.querySelector('input[name="address"]').value.trim();
  } else {
    // other method — collect freeform data
    details.note = 'See contact for details';
  }

  // optional proof upload
  const proofFile = document.getElementById('paymentProofFile').files[0];
  let proofUrl = null;
  if (proofFile) {
    const path = `contract-proofs/${contractId}/${Date.now()}-${proofFile.name}`;
    const { error: upErr } = await supabase.storage.from('proofs').upload(path, proofFile);
    if (upErr) { console.error(upErr); alert('Upload failed'); return; }
    const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path);
    proofUrl = urlData.publicUrl;
  }

  const { data, error } = await supabase.from('contract_payment_details').insert([{
    contract_id: contractId,
    freelancer_id: user.id,
    payment_method: paymentMethod,
    details: details,
    proof_url: proofUrl
  }]).select('id').single();

  if (error) {
    console.error(error);
    alert('Failed to save details');
    return;
  }

  // notify client & admin
  // fetch client id from contracts
  const { data: contract } = await supabase.from('contracts').select('client_id').eq('id', contractId).single();
  if (contract?.client_id) {
    await supabase.from('notifications').insert({
      user_id: contract.client_id,
      type: 'info',
      message: `Freelancer has provided payment receiving details for contract ${contractId}.`
    });
  }
  // notify admin(s)
  const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
  for (const a of admins || []) {
    await supabase.from('notifications').insert({
      user_id: a.id,
      type: 'info',
      message: `Freelancer provided payment details for contract ${contractId}. Please verify.`
    });
  }

  alert('Payment details submitted. Please wait while client reviews or admin verifies.');
  // optional: redirect freelancer to contract view
  window.location.reload();
}

document.addEventListener('DOMContentLoaded', loadContractForFreelancer);


async function loadFreelancerSummary() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    // 1. Fetch user profile with wallet info
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("full_name, tone, language, verified, created_at, coin_balance, frozen_balance, account_number, main_badges(name)")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    // 2. Fetch total earnings from coin transactions (incoming payments)
    const { data: payments, error: paymentsError } = await supabase
      .from("coin_transactions")
      .select("amount")
      .eq("to_user_id", user.id)
      .in("type", ['payment', 'milestone_payment', 'release', 'transfer']);

    if (paymentsError) throw paymentsError;

    // 3. Fetch active milestone projects count
    const { data: activeMilestoneJobs, error: milestoneError } = await supabase
      .from("hires")
      .select(`
        jobs!inner(
          payment_type,
          milestones(status)
        )
      `)
      .eq("freelancer_id", user.id)
      .eq("jobs.payment_type", "milestone");

    if (milestoneError) throw milestoneError;

    // 4. Fetch completed projects (all milestones approved OR single payment released)
    const { data: completedJobs, error: completedError } = await supabase
      .from("hires")
      .select(`
        id,
        job_id,
        jobs(
          payment_type,
          milestones(status)
        )
      `)
      .eq("freelancer_id", user.id);

    if (completedError) throw completedError;

    // Calculate metrics
    const totalEarnings = payments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
    
    // Count active milestone projects (where not all milestones are approved)
    let activeProjectsCount = 0;
    activeMilestoneJobs?.forEach(hire => {
      const milestones = hire.jobs.milestones || [];
      const allApproved = milestones.every(m => m.status === 'approved');
      if (!allApproved) {
        activeProjectsCount++;
      }
    });

    // Count completed projects
    let completedProjectsCount = 0;
    completedJobs?.forEach(hire => {
      if (hire.jobs.payment_type === 'milestone') {
        const milestones = hire.jobs.milestones || [];
        const allApproved = milestones.every(m => m.status === 'approved');
        if (allApproved) {
          completedProjectsCount++;
        }
      } else {
        // For single payment jobs, check if payment was released via coin_holds
        // We'll assume completed for now, or you can add coin_holds check
        completedProjectsCount++;
      }
    });

    // 5. Render the data
    const userNameEl = document.getElementById("userName");
    if (userNameEl) {
      userNameEl.textContent = profile.full_name;
      
      if (profile.main_badges) {
        const badgeSpan = document.createElement("span");
        badgeSpan.className = "main-badge";
        badgeSpan.textContent = profile.main_badges.name;
        userNameEl.appendChild(badgeSpan);
      }
    }

    // Update all summary elements
    const updateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };

    updateElement("totalEarnings", `${totalEarnings.toLocaleString()} TN`);
    updateElement("coinBalance", `${profile.coin_balance || 0} TN`);
    updateElement("frozenBalance", `${profile.frozen_balance || 0} TN`);
    updateElement("activeProjects", activeProjectsCount);
    updateElement("completedProjects", completedProjectsCount);
    updateElement("memberSince", new Date(profile.created_at).toLocaleDateString());
    updateElement("verifiedStatus", profile.verified ? "✅ Verified" : "❌ Not Verified");
    updateElement("accountNumber", profile.account_number || "Not set");

    // Optional: Add tone and language if you have elements for them
    updateElement("communicationTone", profile.tone || "Not set");
    updateElement("preferredLanguage", profile.language || "Not set");

  } catch (error) {
    console.error("Error loading freelancer summary:", error);
    
    // Show error messages to user
    const updateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };

    updateElement("totalEarnings", "Error");
    updateElement("coinBalance", "Error");
    updateElement("activeProjects", "Error");
    updateElement("completedProjects", "Error");
  }
}


document.addEventListener("DOMContentLoaded", () => {
  loadFreelancerSummary();
});


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

// Add this to your existing code
document.addEventListener("DOMContentLoaded", function() {
  const toggle = document.getElementById("availabilityToggle");
  if (toggle) {
    toggle.addEventListener("change", toggleAvailability);
  }
});


// Load verification banner
async function loadVerificationBanner() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  
  if (authError || !user) return;

  const { data: userData, error } = await supabase
    .from("users")
    .select("id_verified, gov_id_path, id_rejection_reason")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Error loading user data:", error);
    return;
  }

  const banner = document.getElementById("verificationBanner");
  const verifyBtn = document.getElementById("verifyNowBtn");
  const closeBtn = document.getElementById("closeBanner");

  // Show banner if not verified
  if (!userData.id_verified) {
    banner.style.display = 'block';
    
    // Set banner state based on verification status
    if (userData.gov_id_path) {
      if (userData.id_rejection_reason) {
        // ID was rejected
        banner.classList.add('rejected');
        document.querySelector('.banner-text h3').textContent = 'ID Verification Rejected';
        document.querySelector('.banner-text p').textContent = `Reason: ${userData.id_rejection_reason}. Please upload a new ID.`;
        verifyBtn.textContent = 'Upload New ID';
      } else {
        // ID uploaded, pending approval
        banner.classList.add('pending');
        document.querySelector('.banner-text h3').textContent = 'Verification Pending';
        document.querySelector('.banner-text p').textContent = 'Your ID is under review. We\'ll notify you once verified.';
        verifyBtn.textContent = 'View Status';
      }
    } else {
      // No ID uploaded yet
      banner.classList.remove('pending', 'rejected');
      document.querySelector('.banner-text h3').textContent = 'Complete ID Verification';
      document.querySelector('.banner-text p').textContent = 'Verify your identity to unlock all platform features';
      verifyBtn.textContent = 'Verify Now';
    }

    // Handle verify button click
    verifyBtn.onclick = () => {
      window.location.href = 'settings.html';
    };

    // Handle close button click
    closeBtn.onclick = () => {
      banner.style.display = 'none';
      // Optional: Store dismissal in localStorage to not show again for X time
      localStorage.setItem('bannerDismissed', Date.now().toString());
    };
  } else {
    // User is verified - hide banner
    banner.style.display = 'none';
  }
}

// Optional: Check if user recently dismissed the banner
function shouldShowBanner() {
  const dismissed = localStorage.getItem('bannerDismissed');
  if (!dismissed) return true;
  
  const dismissedTime = parseInt(dismissed);
  const now = Date.now();
  const hoursSinceDismissal = (now - dismissedTime) / (1000 * 60 * 60);
  
  // Show banner again after 24 hours
  return hoursSinceDismissal > 24;
}

// Initialize banner when page loads
document.addEventListener("DOMContentLoaded", async () => {
  if (shouldShowBanner()) {
    await loadVerificationBanner();
  }
});