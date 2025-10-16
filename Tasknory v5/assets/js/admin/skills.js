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

document.addEventListener("DOMContentLoaded", () => {
    loadVerifications();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    const filterSelect = document.getElementById('filterSelect');
    const closeBtn = document.querySelector('.close-btn');
    const modal = document.getElementById('detailsModal');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadVerifications);
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', loadVerifications);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

// Load pending verifications with stats
async function loadVerifications() {
    const container = document.getElementById("verificationList");
    const filter = document.getElementById('filterSelect')?.value || 'all';
    
    container.innerHTML = '<div class="loading">Loading verifications...</div>';

    try {
        // Build query based on filter
        let query = supabase
            .from("skill_verifications")
            .select(`
                id,
                years_experience,
                reference_link,
                proof_url,
                status,
                freelancer_skills(
                    id,
                    verified,
                    skills_master(skill_name),
                    users!freelancer_skills_freelancer_id_fkey(full_name, email)
                )
            `)
            .order("id", { ascending: false });

        // Apply filters
        if (filter === 'pending') {
            query = query.eq("status", "pending");
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        // Update stats
        updateStats(data);
        
        // Update badge count
        const pendingCount = data.filter(v => v.status === 'pending').length;
        const skillsBadge = document.getElementById('skillsBadge');
        if (skillsBadge) {
            skillsBadge.textContent = pendingCount;
        }

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No Verifications Found</h3>
                    <p>There are no skill verifications matching your current filter.</p>
                </div>
            `;
            return;
        }

        renderVerifications(data, container);
    } catch (error) {
        console.error("Error loading verifications:", error);
        container.innerHTML = '<div class="error">Error loading verifications. Please try again.</div>';
    }
}

// Update statistics
function updateStats(data) {
    const pending = data.filter(v => v.status === 'pending').length;
    const approved = data.filter(v => v.status === 'approved').length;
    const rejected = data.filter(v => v.status === 'rejected').length;
    const total = data.length;

    const pendingCountElem = document.getElementById('pendingCount');
    const approvedCountElem = document.getElementById('approvedCount');
    const rejectedCountElem = document.getElementById('rejectedCount');
    const totalCountElem = document.getElementById('totalCount');

    if (pendingCountElem) pendingCountElem.textContent = pending;
    if (approvedCountElem) approvedCountElem.textContent = approved;
    if (rejectedCountElem) rejectedCountElem.textContent = rejected;
    if (totalCountElem) totalCountElem.textContent = total;
}

// Render verifications list
function renderVerifications(data, container) {
    container.innerHTML = '';
    const template = document.getElementById("verificationCardTemplate");

    data.forEach(v => {
        const clone = template.content.cloneNode(true);

        // Populate basic info
        clone.querySelector(".skill-name").textContent = v.freelancer_skills.skills_master.skill_name;
        clone.querySelector(".freelancer-name").textContent = v.freelancer_skills.users.full_name;
        clone.querySelector(".years").textContent = v.years_experience;
        
        // Remove submission date since we don't have created_at
        const submissionDateElem = clone.querySelector(".submission-date");
        if (submissionDateElem) {
            submissionDateElem.textContent = "Not recorded";
        }

        // Set reference link
        const referenceLink = clone.querySelector(".reference-link");
        referenceLink.href = v.reference_link;
        referenceLink.textContent = "View Reference";

        // Set proof link if available
        const proofWrapper = clone.querySelector(".proof-wrapper");
        if (v.proof_url) {
            const proofLink = clone.querySelector(".proof-link");
            proofLink.href = v.proof_url;
            proofLink.textContent = "Download Proof";
        } else {
            proofWrapper.innerHTML = '<span class="label">Proof:</span><span class="value">No proof provided</span>';
        }

        // Update status badge
        const statusBadge = clone.querySelector(".status-badge");
        statusBadge.textContent = v.status;
        statusBadge.className = `status-badge ${v.status}`;

        // Add event listeners
        setupCardEventListeners(clone, v);

        container.appendChild(clone);
    });
}

// Setup event listeners for each card
function setupCardEventListeners(card, verification) {
    // Approve button
    card.querySelector(".approve-btn").addEventListener("click", async () => {
        if (confirm(`Approve skill verification for ${verification.freelancer_skills.users.full_name}?`)) {
            await handleVerificationDecision(verification.id, verification.freelancer_skills.id, "approved");
        }
    });

    // Reject button
    card.querySelector(".reject-btn").addEventListener("click", async () => {
        if (confirm(`Reject skill verification for ${verification.freelancer_skills.users.full_name}?`)) {
            await handleVerificationDecision(verification.id, verification.freelancer_skills.id, "rejected");
        }
    });

    // View details button
    card.querySelector(".view-details-btn").addEventListener("click", () => {
        showVerificationDetails(verification);
    });
}

// Show verification details in modal
function showVerificationDetails(verification) {
    const modal = document.getElementById("detailsModal");
    const modalBody = document.getElementById("modalBody");

    modalBody.innerHTML = `
        <div class="modal-details">
            <div class="modal-detail-item">
                <span class="label">Skill:</span>
                <span class="value">${verification.freelancer_skills.skills_master.skill_name}</span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Freelancer:</span>
                <span class="value">${verification.freelancer_skills.users.full_name} (${verification.freelancer_skills.users.email})</span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Years of Experience:</span>
                <span class="value">${verification.years_experience} years</span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Reference Link:</span>
                <span class="value"><a href="${verification.reference_link}" target="_blank">${verification.reference_link}</a></span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Proof File:</span>
                <span class="value">${verification.proof_url ? `<a href="${verification.proof_url}" target="_blank">Download Proof</a>` : 'No proof provided'}</span>
            </div>
            <div class="modal-detail-item">
                <span class="label">Status:</span>
                <span class="value status-badge ${verification.status}">${verification.status}</span>
            </div>
        </div>
    `;

    modal.style.display = "block";
}

// Approve / Reject a verification
async function handleVerificationDecision(verificationId, freelancerSkillId, decision) {
    try {
        // Show loading state
        const container = document.getElementById("verificationList");
        container.innerHTML = '<div class="loading">Processing...</div>';

        // 1. Update verification status
        const { error: vErr } = await supabase
            .from("skill_verifications")
            .update({ status: decision })
            .eq("id", verificationId);

        if (vErr) throw vErr;

        // 2. If approved, mark freelancer skill as verified
        if (decision === "approved") {
            const { error: fsErr } = await supabase
                .from("freelancer_skills")
                .update({ verified: true })
                .eq("id", freelancerSkillId);

            if (fsErr) throw fsErr;
        }

        // 3. Get freelancer for notification
        const { data: skillRow } = await supabase
            .from("freelancer_skills")
            .select("freelancer_id")
            .eq("id", freelancerSkillId)
            .single();

        if (skillRow?.freelancer_id) {
            await supabase.from("notifications").insert({
                user_id: skillRow.freelancer_id,
                type: "skill",
                message: decision === "approved"
                    ? "One of your skills has been verified ✅"
                    : "Your skill verification was rejected ❌. Please review and resubmit."
            });
        }

        // Show success message
        showNotification(`Skill verification ${decision} successfully!`, "success");
        
        // Reload verifications
        loadVerifications();
    } catch (err) {
        console.error("Decision error:", err);
        showNotification("Failed to update verification.", "error");
        loadVerifications(); // Reload anyway to show current state
    }
}

// Notification function
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
        notification.style.background = "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
    } else {
        notification.style.background = "var(--gradient-admin)";
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
`;
document.head.appendChild(style);

// Export for potential use elsewhere
export { loadVerifications, handleVerificationDecision };