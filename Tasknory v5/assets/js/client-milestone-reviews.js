import { supabase } from "../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadPendingMilestoneReviews);

async function loadPendingMilestoneReviews() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    document.getElementById("milestoneReviewsList").innerHTML = "<p class='error'>You must be logged in.</p>";
    return;
  }

  const container = document.getElementById("milestoneReviewsList");
  container.innerHTML = "<div class='loading'>Loading milestone submissions...</div>";

  try {
    // Fetch submitted milestones from jobs where user is client
    const { data: milestones, error: milestonesError } = await supabase
      .from("milestones")
      .select(`
        id,
        job_id,
        title,
        description,
        amount,
        status,
        sequence,
        submission_url,
        submitted_at,
        jobs(
          id,
          title,
          description,
          hires(
            id,
            freelancer_id,
            users!hires_freelancer_id_fkey(full_name)
          )
        ),
        milestone_submissions(
          message,
          created_at
        )
      `)
      .eq("status", "submitted")
      .eq("jobs.client_id", user.id)
      .order("submitted_at", { ascending: true });

    if (milestonesError) throw milestonesError;

    if (!milestones || milestones.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Pending Milestone Reviews</h3>
          <p>All milestone submissions have been reviewed.</p>
          <p>New submissions from freelancers will appear here for your approval.</p>
        </div>
      `;
      updatePendingCount(0);
      return;
    }

    // Filter out milestones without valid job data
    const validMilestones = milestones.filter(milestone => 
      milestone.jobs && milestone.jobs.id && milestone.jobs.hires && milestone.jobs.hires.length > 0
    );

    if (validMilestones.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Valid Submissions</h3>
          <p>There are issues with the milestone submission data.</p>
        </div>
      `;
      updatePendingCount(0);
      return;
    }

    // Render submissions
    container.innerHTML = '<div class="reviews-grid"></div>';
    const reviewsGrid = container.querySelector('.reviews-grid');

    validMilestones.forEach((milestone, index) => {
      const job = milestone.jobs;
      const hire = job.hires[0];
      const freelancerName = hire.users?.full_name || "Unknown Freelancer";
      const submission = milestone.milestone_submissions?.[0];
      
      const submissionCard = document.createElement("div");
      submissionCard.className = "submission-card";
      submissionCard.style.animationDelay = `${index * 0.1}s`;
      
      submissionCard.innerHTML = `
        <div class="submission-header">
          <h3>${escapeHtml(job.title)}</h3>
          <span class="submission-badge">Milestone ${milestone.sequence}</span>
        </div>
        
        <div class="submission-meta">
          <div class="meta-item">
            <span class="meta-label">Freelancer</span>
            <span class="meta-value">${escapeHtml(freelancerName)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Milestone Amount</span>
            <span class="meta-value">$${milestone.amount}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Submitted</span>
            <span class="meta-value">${new Date(milestone.submitted_at).toLocaleString()}</span>
          </div>
        </div>

        <div class="milestone-details">
          <h4>${escapeHtml(milestone.title)}</h4>
          <p class="milestone-description">${escapeHtml(milestone.description)}</p>
          
          ${submission ? `
            <div class="submission-message">
              <strong>Freelancer's Notes:</strong>
              <p>${escapeHtml(submission.message)}</p>
            </div>
          ` : ''}
        </div>

        <div class="submission-actions">
          <button class="btn btn-primary review-btn" data-milestone-id="${milestone.id}">
            👁️ Review Submission
          </button>
          <button class="btn btn-secondary" onclick="window.location.href='../chat/chat.html?hire=${hire.id}'">
            💬 Chat with Freelancer
          </button>
        </div>
      `;

      reviewsGrid.appendChild(submissionCard);
    });

    updatePendingCount(validMilestones.length);

    // Attach event listeners to review buttons
    document.querySelectorAll('.review-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const milestoneId = e.target.dataset.milestoneId;
        openReviewModal(milestoneId);
      });
    });

  } catch (error) {
    console.error("Error loading milestone reviews:", error);
    container.innerHTML = "<p class='error'>Error loading submissions. Please try again.</p>";
  }
}

// This function should be called when a milestone-based job is hired
async function initializeMilestoneHolds(hireId, jobId) {
  try {
    // Get all milestones for this job
    const { data: milestones, error } = await supabase
      .from("milestones")
      .select("id, amount")
      .eq("job_id", jobId);

    if (error) throw error;

    if (!milestones || milestones.length === 0) {
      console.warn("No milestones found for job:", jobId);
      return;
    }

    // Create coin holds for each milestone
    const coinHolds = milestones.map(milestone => ({
      hire_id: hireId,
      milestone_id: milestone.id,
      amount: milestone.amount,
      status: 'held',
      released_at: null,
      created_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from("coin_holds")
      .insert(coinHolds);

    if (insertError) throw insertError;

    console.log(`Created ${coinHolds.length} coin holds for hire ${hireId}`);
    
  } catch (error) {
    console.error("Error initializing milestone holds:", error);
  }
}

async function openReviewModal(milestoneId) {
  const modal = document.getElementById('reviewModal');
  const modalTitle = document.getElementById('modalTitle');
  const reviewContent = document.getElementById('reviewContent');
  const approveBtn = document.getElementById('approveBtn');
  const rejectBtn = document.getElementById('rejectBtn');

  // Show loading state
  reviewContent.innerHTML = "<div class='loading'>Loading submission details...</div>";
  approveBtn.disabled = true;
  rejectBtn.disabled = true;

  try {
    // Fetch detailed milestone data
    const { data: milestone, error } = await supabase
      .from("milestones")
      .select(`
        id,
        job_id,
        title,
        description,
        amount,
        sequence,
        submission_url,
        submitted_at,
        jobs(
          id,
          title,
          hires(
            id,
            freelancer_id,
            users!hires_freelancer_id_fkey(full_name)
          )
        ),
        milestone_submissions(
          message,
          created_at
        )
      `)
      .eq("id", milestoneId)
      .single();

    if (error) throw error;

    if (!milestone) {
      reviewContent.innerHTML = "<p class='error'>Submission not found.</p>";
      return;
    }

    const job = milestone.jobs;
    const hire = job.hires[0];
    const freelancerName = hire.users?.full_name || "Unknown Freelancer";
    const submission = milestone.milestone_submissions?.[0];

    // Build review content
    reviewContent.innerHTML = `
      <div class="review-details">
        <div class="review-header">
          <h4>${escapeHtml(job.title)}</h4>
          <span class="amount-badge">$${milestone.amount}</span>
        </div>
        
        <div class="review-meta">
          <p><strong>Freelancer:</strong> ${escapeHtml(freelancerName)}</p>
          <p><strong>Milestone:</strong> ${milestone.sequence}. ${escapeHtml(milestone.title)}</p>
          <p><strong>Submitted:</strong> ${new Date(milestone.submitted_at).toLocaleString()}</p>
        </div>

        <div class="milestone-info">
          <h5>Milestone Requirements</h5>
          <p>${escapeHtml(milestone.description)}</p>
        </div>

        ${submission ? `
          <div class="submission-info">
            <h5>Freelancer's Submission Notes</h5>
            <p>${escapeHtml(submission.message)}</p>
          </div>
        ` : ''}

        <div class="submission-files">
          <h5>Deliverables</h5>
          ${milestone.submission_url ? `
            <a href="${milestone.submission_url}" target="_blank" class="download-link">
              📥 Download Submitted Files (ZIP)
            </a>
          ` : '<p>No files submitted.</p>'}
        </div>
      </div>
    `;

    // Set modal title
    modalTitle.textContent = `Review: ${escapeHtml(milestone.title)}`;

    // Enable buttons and set up event handlers
    approveBtn.disabled = false;
    rejectBtn.disabled = false;

    // Remove existing event listeners
    approveBtn.replaceWith(approveBtn.cloneNode(true));
    rejectBtn.replaceWith(rejectBtn.cloneNode(true));

    // Get fresh references to buttons
    const freshApproveBtn = document.getElementById('approveBtn');
    const freshRejectBtn = document.getElementById('rejectBtn');

    // Add new event listeners
    freshApproveBtn.addEventListener('click', () => handleMilestoneDecision(milestoneId, 'approve'));
    freshRejectBtn.addEventListener('click', () => handleMilestoneDecision(milestoneId, 'reject'));

    // Show modal
    modal.style.display = 'block';

  } catch (error) {
    console.error("Error loading review details:", error);
    reviewContent.innerHTML = "<p class='error'>Error loading submission details.</p>";
  }
}

async function handleMilestoneDecision(milestoneId, decision) {
  const approveBtn = document.getElementById('approveBtn');
  const rejectBtn = document.getElementById('rejectBtn');

  // Disable buttons during processing
  approveBtn.disabled = true;
  rejectBtn.disabled = true;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in.');

    if (decision === 'approve') {
      approveBtn.innerHTML = '✅ Approving...';
      
      // Update milestone status
      const { error: updateError } = await supabase
        .from("milestones")
        .update({
          status: 'approved',
          approved_at: new Date().toISOString()
        })
        .eq('id', milestoneId);

      if (updateError) throw updateError;

      // Release payment for this milestone
      await releaseMilestonePayment(milestoneId);

      // Notify freelancer
      await notifyFreelancer(milestoneId, 'approved');

      approveBtn.innerHTML = '✅ Approved!';
      setTimeout(() => {____
        document.getElementById('reviewModal').style.display = 'none';
        loadPendingMilestoneReviews(); // Refresh the list
      }, 1000);

// In client-milestone-reviews.js - update the rejection part
} else if (decision === 'reject') {
  rejectBtn.innerHTML = '❌ Rejecting...';
  
  const reason = prompt("Please provide feedback for the freelancer (what needs to be improved):");
  if (reason === null) {
    // User cancelled
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
    rejectBtn.innerHTML = '❌ Request Revisions';
    return;
  }

  // Update milestone status WITH rejection reason
  const { error: updateError } = await supabase
    .from("milestones")
    .update({
      status: 'rejected',
      rejection_reason: reason  // Store the rejection reason
    })
    .eq('id', milestoneId);

  if (updateError) throw updateError;

  // Notify freelancer with reason
  await notifyFreelancer(milestoneId, 'rejected', reason);

  rejectBtn.innerHTML = '❌ Rejected!';
  setTimeout(() => {
    document.getElementById('reviewModal').style.display = 'none';
    loadPendingMilestoneReviews(); // Refresh the list
  }, 1000);
}

  } catch (error) {
    console.error("Error processing milestone decision:", error);
    alert('Failed to process decision: ' + error.message);
    
    // Reset buttons
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
    approveBtn.innerHTML = '✅ Approve & Release Payment';
    rejectBtn.innerHTML = '❌ Request Revisions';
  }
}

async function releaseMilestonePayment(milestoneId) {
  try {
    // Get milestone details including amount
    const { data: milestone, error: milestoneError } = await supabase
      .from("milestones")
      .select(`
        amount,
        job_id,
        jobs(
          hires(
            id,
            freelancer_id
          )
        )
      `)
      .eq('id', milestoneId)
      .single();

    if (milestoneError) throw milestoneError;

    const hire = milestone.jobs.hires[0];
    if (!hire) throw new Error('Hire not found for this milestone');

    // First, get the current balance of the freelancer
    const { data: freelancer, error: freelancerError } = await supabase
      .from("users")
      .select("coin_balance")
      .eq("id", hire.freelancer_id)
      .single();

    if (freelancerError) throw freelancerError;

    // Calculate new balance
    const currentBalance = freelancer.coin_balance || 0;
    const newBalance = currentBalance + parseFloat(milestone.amount);

    // Update freelancer's balance directly
    const { error: updateError } = await supabase
      .from("users")
      .update({ 
        coin_balance: newBalance 
      })
      .eq('id', hire.freelancer_id);

    if (updateError) throw updateError;

    // Also update the coin_holds table to track this release
    const { error: holdError } = await supabase
      .from("coin_holds")
      .update({
        status: 'released',
        released_at: new Date().toISOString()
      })
      .eq('milestone_id', milestoneId);

    if (holdError) {
      console.warn('Could not update coin_holds:', holdError);
      // Continue anyway since the main payment was successful
    }

    console.log(`Released $${milestone.amount} for milestone ${milestoneId}. New balance: ${newBalance}`);

  } catch (error) {
    console.error("Error releasing milestone payment:", error);
    throw error;
  }
}

async function notifyFreelancer(milestoneId, decision, reason = '') {
  try {
    // Get milestone and freelancer details
    const { data: milestone, error } = await supabase
      .from("milestones")
      .select(`
        title,
        jobs(
          hires(
            freelancer_id
          )
        )
      `)
      .eq('id', milestoneId)
      .single();

    if (error) throw error;

    const hire = milestone.jobs.hires[0];
    if (!hire) throw new Error('Hire not found');

    let message = '';
    if (decision === 'approved') {
      message = `Your milestone "${milestone.title}" has been approved and payment has been released.`;
    } else if (decision === 'rejected') {
      message = `Your milestone "${milestone.title}" needs revisions. Feedback: ${reason}`;
    }

    await supabase.from("notifications").insert({
      user_id: hire.freelancer_id,
      type: "milestone",
      message: message
    });

  } catch (error) {
    console.error("Error notifying freelancer:", error);
    // Don't throw error here - notification failure shouldn't block the main action
  }
}

function updatePendingCount(count) {
  document.getElementById('pendingCount').textContent = count;
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}