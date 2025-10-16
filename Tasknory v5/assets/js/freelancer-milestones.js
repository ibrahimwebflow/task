import { supabase } from "../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadMilestoneProjects);

async function loadMilestoneProjects() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    document.getElementById("milestonesList").innerHTML = "<p class='error'>You must be logged in.</p>";
    return;
  }

  const container = document.getElementById("milestonesList");
  container.innerHTML = "<div class='loading'>Loading your milestone projects...</div>";

  try {
    // Fetch milestone-based hires where freelancer is assigned
    const { data: hires, error: hiresError } = await supabase
      .from("hires")
      .select(`
        id,
        job_id,
        created_at,
        jobs(
          id,
          title,
          description,
          payment_type,
          budget,
          client_id
        ),
        clients:users!hires_client_id_fkey(full_name)
      `)
      .eq("freelancer_id", user.id)
      .eq("jobs.payment_type", "milestone");

    if (hiresError) throw hiresError;

    if (!hires || hires.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Milestone Projects</h3>
          <p>You don't have any milestone-based projects at the moment.</p>
          <p>Milestone projects will appear here when clients hire you for milestone-based work.</p>
        </div>
      `;
      updateCounts(0, 0);
      return;
    }

    // Filter out hires with null jobs
    const validHires = hires.filter(hire => hire.jobs && hire.jobs.id);
    
    if (validHires.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No Valid Milestone Projects</h3>
          <p>Your milestone projects data appears to be incomplete.</p>
        </div>
      `;
      updateCounts(0, 0);
      return;
    }

    // Fetch milestones for each job (not hire)
    const jobIds = validHires.map(h => h.job_id);
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
        approved_at
      `)
      .in("job_id", jobIds)
      .order("sequence", { ascending: true });

    if (milestonesError) throw milestonesError;

    // Group milestones by job_id
    const milestonesByJob = {};
    milestones?.forEach(milestone => {
      if (!milestonesByJob[milestone.job_id]) {
        milestonesByJob[milestone.job_id] = [];
      }
      milestonesByJob[milestone.job_id].push(milestone);
    });

    // Render projects
    container.innerHTML = '<div class="projects-grid"></div>';
    const projectsGrid = container.querySelector('.projects-grid');

    let pendingCount = 0;
    let completedCount = 0;

    validHires.forEach(hire => {
      const jobMilestones = milestonesByJob[hire.job_id] || [];
      const pendingMilestones = jobMilestones.filter(m => m.status === 'pending');
      const submittedMilestones = jobMilestones.filter(m => m.status === 'submitted');
      const approvedMilestones = jobMilestones.filter(m => m.status === 'approved');

      pendingCount += pendingMilestones.length;
      completedCount += approvedMilestones.length;

      // Safe access to job properties
      const jobTitle = hire.jobs?.title || "Untitled Project";
      const jobDescription = hire.jobs?.description || "No description available";
      const jobBudget = hire.jobs?.budget || 0;
      const clientName = hire.clients?.full_name || "Unknown Client";

      const projectCard = document.createElement("div");
      projectCard.className = "project-card";
      
      projectCard.innerHTML = `
        <div class="project-header">
          <h3>${escapeHtml(jobTitle)}</h3>
          <span class="project-badge milestone-badge">💰 Milestone Project</span>
        </div>
        
        <div class="project-description">
          ${escapeHtml(jobDescription)}
        </div>
        
        <div class="project-meta">
          <div class="meta-item">
            <span class="meta-label">Client</span>
            <span class="meta-value">${escapeHtml(clientName)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Total Budget</span>
            <span class="meta-value">$${jobBudget}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Hired On</span>
            <span class="meta-value">${new Date(hire.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div class="milestones-progress">
          <div class="progress-header">
            <h4>Project Milestones</h4>
            <span class="progress-stats">
              ${approvedMilestones.length}/${jobMilestones.length} Completed
            </span>
          </div>
          
          <div class="milestones-list">
            ${renderMilestonesList(jobMilestones, hire.id, hire.job_id)}
          </div>
        </div>
      `;

      projectsGrid.appendChild(projectCard);
    });

    updateCounts(pendingCount, completedCount);

    // Attach event listeners to submit buttons
    document.querySelectorAll('.submit-milestone-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const milestoneId = e.target.dataset.milestoneId;
        const hireId = e.target.dataset.hireId;
        const jobId = e.target.dataset.jobId;
        openSubmissionModal(milestoneId, hireId, jobId);
      });
    });

  } catch (error) {
    console.error("Error loading milestone projects:", error);
    container.innerHTML = "<p class='error'>Error loading projects. Please try again.</p>";
  }
}

function renderMilestonesList(milestones, hireId, jobId) {
  if (!milestones || milestones.length === 0) {
    return '<p class="no-milestones">No milestones defined for this project.</p>';
  }

  return milestones.map(milestone => {
    const statusClass = getStatusClass(milestone.status);
    const statusIcon = getStatusIcon(milestone.status);
    const amountDisplay = `$${milestone.amount || 0}`;

    let actionButton = '';
    if (milestone.status === 'pending' || milestone.status === 'rejected') {
      // Allow submission for both pending AND rejected milestones
      actionButton = `
        <button class="submit-milestone-btn" 
                data-milestone-id="${milestone.id}" 
                data-hire-id="${hireId}"
                data-job-id="${jobId}">
          ${milestone.status === 'rejected' ? '🔄 Resubmit Work' : '📤 Submit Work'}
        </button>
      `;
    } else if (milestone.status === 'submitted') {
      actionButton = '<span class="status-badge submitted">⏳ Awaiting Approval</span>';
    } else if (milestone.status === 'approved') {
      actionButton = '<span class="status-badge approved">✅ Approved & Paid</span>';
    }

    // Add rejection reason if available (you might want to store this in the database)
    const rejectionInfo = milestone.status === 'rejected' ? `
      <div class="rejection-info">
        <strong>Client Feedback:</strong>
        <p>${getRejectionReason(milestone) || 'Revisions requested. Please review and resubmit.'}</p>
      </div>
    ` : '';

    return `
      <div class="milestone-item ${statusClass}">
        <div class="milestone-info">
          <div class="milestone-header">
            <h5>${milestone.sequence}. ${escapeHtml(milestone.title || 'Untitled Milestone')}</h5>
            <span class="milestone-amount">${amountDisplay}</span>
          </div>
          <p class="milestone-description">${escapeHtml(milestone.description || 'No description available')}</p>
          ${rejectionInfo}
          <div class="milestone-status">
            <span class="status-icon">${statusIcon}</span>
            <span class="status-text">${getStatusText(milestone.status)}</span>
            ${milestone.submitted_at ? `
              <span class="submission-date">
                Submitted: ${new Date(milestone.submitted_at).toLocaleDateString()}
              </span>
            ` : ''}
            ${milestone.approved_at && milestone.status === 'approved' ? `
              <span class="approval-date">
                Approved: ${new Date(milestone.approved_at).toLocaleDateString()}
              </span>
            ` : ''}
          </div>
        </div>
        <div class="milestone-actions">
          ${actionButton}
        </div>
      </div>
    `;
  }).join('');
}

// NEW: Function to get rejection reason (you'll need to store this in your database)
function getRejectionReason(milestone) {
  // You can store rejection reasons in a separate table or add a 'rejection_reason' column to milestones
  // For now, we'll return a generic message
  return milestone.rejection_reason || null;
}

function getStatusClass(status) {
  const statusClasses = {
    'pending': 'status-pending',
    'submitted': 'status-submitted', 
    'approved': 'status-approved',
    'rejected': 'status-rejected'
  };
  return statusClasses[status] || 'status-pending';
}

function getStatusIcon(status) {
  const statusIcons = {
    'pending': '⏳',
    'submitted': '📤',
    'approved': '✅',
    'rejected': '❌'
  };
  return statusIcons[status] || '⏳';
}

function getStatusText(status) {
  const statusTexts = {
    'pending': 'Ready to Start',
    'submitted': 'Submitted for Review',
    'approved': 'Approved & Completed',
    'rejected': 'Revisions Requested - Click to Resubmit'
  };
  return statusTexts[status] || 'Pending';
}

function updateCounts(pending, completed) {
  document.getElementById('pendingCount').textContent = pending;
  document.getElementById('completedCount').textContent = completed;
}

// Modal Functions
function openSubmissionModal(milestoneId, hireId, jobId) {
  const modal = document.getElementById('submissionModal');
  const modalTitle = document.getElementById('modalTitle');
  const milestoneIdInput = document.getElementById('currentMilestoneId');
  
  // Store the milestone, hire, and job IDs
  milestoneIdInput.value = milestoneId;
  milestoneIdInput.dataset.hireId = hireId;
  milestoneIdInput.dataset.jobId = jobId;
  
  // Set modal title (we'll fetch milestone details if needed)
  modalTitle.textContent = 'Submit Milestone Deliverables';
  
  // Reset form
  document.getElementById('submissionForm').reset();
  
  // Show modal
  modal.style.display = 'block';
}

// Handle form submission
document.getElementById('submissionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const milestoneId = document.getElementById('currentMilestoneId').value;
  const hireId = document.getElementById('currentMilestoneId').dataset.hireId;
  const jobId = document.getElementById('currentMilestoneId').dataset.jobId;
  const message = document.getElementById('submissionMessage').value;
  const fileInput = document.getElementById('submissionFile');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Please select a ZIP file to upload.');
    return;
  }
  
  if (!file.name.toLowerCase().endsWith('.zip')) {
    alert('Please upload a ZIP file only.');
    return;
  }
  
  await submitMilestone(milestoneId, hireId, jobId, message, file);
});

async function submitMilestone(milestoneId, hireId, jobId, message, file) {
  const submitBtn = document.getElementById('submitMilestoneBtn');
  const originalText = submitBtn.innerHTML;
  
  submitBtn.innerHTML = '📤 Uploading...';
  submitBtn.disabled = true;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in.');

    // Upload file to storage
    const filePath = `milestone-submissions/${jobId}/${milestoneId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage.from("submissions").getPublicUrl(filePath);
    const fileUrl = urlData.publicUrl;

    // Update milestone status and store submission
    const { error: updateError } = await supabase
      .from("milestones")
      .update({
        status: 'submitted',
        submission_url: fileUrl,
        submitted_at: new Date().toISOString(),
        // Clear any previous rejection data when resubmitting
        rejection_reason: null
      })
      .eq('id', milestoneId);

    if (updateError) throw updateError;

    // Create milestone submission record
    const { error: submissionError } = await supabase
      .from("milestone_submissions")
      .insert({
        milestone_id: milestoneId,
        freelancer_id: user.id,
        file_url: fileUrl,
        message: message
      });

    if (submissionError) throw submissionError;

    // Notify client
    const { data: job } = await supabase
      .from("jobs")
      .select("client_id")
      .eq("id", jobId)
      .single();

    if (job) {
      await supabase.from("notifications").insert({
        user_id: job.client_id,
        type: "milestone",
        message: `Freelancer ${milestoneId === 'rejected' ? 'resubmitted' : 'submitted'} deliverables for a milestone. Please review.`
      });
    }

    // Success
    submitBtn.innerHTML = '✅ Submitted!';
    setTimeout(() => {
      document.getElementById('submissionModal').style.display = 'none';
      loadMilestoneProjects(); // Refresh the list
    }, 1500);

  } catch (error) {
    console.error('Submission error:', error);
    alert('Failed to submit milestone: ' + error.message);
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}