// badges.js (Part 1 - Main Ladder)
import { supabase } from "../../supabase/config.js";

export async function updateMainBadges() {
  try {
    // 1. Get all freelancers
    const { data: freelancers, error: freelancersError } = await supabase
      .from("users")
      .select("id")
      .eq("role", "freelancer");

    if (freelancersError) throw freelancersError;

    // 2. For each freelancer, count completed contracts
    for (const freelancer of freelancers) {
      const { count, error: contractsError } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("freelancer_id", freelancer.id)
        .eq("status", "completed");

      if (contractsError) continue;

      const completedJobs = count || 0;

      // 3. Find best matching badge from main_badges
      const { data: badges, error: badgeError } = await supabase
        .from("main_badges")
        .select("*")
        .lte("min_jobs", completedJobs)
        .order("min_jobs", { ascending: false })
        .limit(1);

      if (badgeError || !badges || badges.length === 0) continue;

      const badgeId = badges[0].id;

      // 4. Update freelancer's main_badge_id
      await supabase
        .from("users")
        .update({ main_badge_id: badgeId })
        .eq("id", freelancer.id);
    }

    console.log("Main badges updated successfully ✅");
  } catch (err) {
    console.error("Error updating main badges:", err.message);
  }
}


// badges.js (Part 2 - Achievements)

export async function updateAchievementBadges() {
  try {
    // 1. Get all freelancers
    const { data: freelancers, error: freelancersError } = await supabase
      .from("users")
      .select("id, achievements, verified, inbit_choice, inbit_partner");

    if (freelancersError) throw freelancersError;

    for (const freelancer of freelancers) {
      let achievements = freelancer.achievements || [];

      // --- 2. Achievement Checks ---

      // Verified ID
      if (freelancer.verified && !achievements.includes("Verified ID")) {
        achievements.push("Verified ID");
      }

      // Skill Verified → at least 1 skill with verified=true
      const { data: skills } = await supabase
        .from("freelancer_skills")
        .select("id")
        .eq("freelancer_id", freelancer.id)
        .eq("verified", true);

      if (skills && skills.length > 0 && !achievements.includes("Skill Verified")) {
        achievements.push("Skill Verified");
      }

      // Trustworthy → 10 completed contracts without dispute
      const { count: contractsCount } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("freelancer_id", freelancer.id)
        .eq("status", "completed")
        .is("disputed", false);

      if (contractsCount >= 10 && !achievements.includes("Trustworthy")) {
        achievements.push("Trustworthy");
      }

      // Early Adopter → account created in first year
      // (adjust your platform launch date here)
      const { data: userRow } = await supabase
        .from("users")
        .select("created_at")
        .eq("id", freelancer.id)
        .single();

      if (userRow) {
        const createdDate = new Date(userRow.created_at);
        const launchDate = new Date("2025-01-01"); // Example
        const cutoff = new Date("2026-01-01"); // First year
        if (createdDate >= launchDate && createdDate < cutoff && !achievements.includes("Early Adopter")) {
          achievements.push("Early Adopter");
        }
      }

      // Top Match → hired through auto-matching 5+ times
      const { count: matchHires } = await supabase
        .from("hires")
        .select("id", { count: "exact", head: true })
        .eq("freelancer_id", freelancer.id)
        .eq("via_match", true); // you must add this field when auto-match hires occur

      if (matchHires >= 5 && !achievements.includes("Top Match")) {
        achievements.push("Top Match");
      }

      // Contract Closer → 20 completed jobs, zero cancellations
      const { count: closedContracts } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("freelancer_id", freelancer.id)
        .eq("status", "completed");

      const { count: cancelledContracts } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("freelancer_id", freelancer.id)
        .eq("status", "cancelled");

      if (closedContracts >= 20 && cancelledContracts === 0 && !achievements.includes("Contract Closer")) {
        achievements.push("Contract Closer");
      }

      // Manual Admin Badges
      if (freelancer.inbit_choice && !achievements.includes("Inbit Choice")) {
        achievements.push("Inbit Choice");
      }
      if (freelancer.inbit_partner && !achievements.includes("Inbit Partner")) {
        achievements.push("Inbit Partner");
      }

      // --- 3. Save back if changed ---
      await supabase
        .from("users")
        .update({ achievements })
        .eq("id", freelancer.id);
    }

    console.log("Achievement badges updated ✅");
  } catch (err) {
    console.error("Error updating achievement badges:", err.message);
  }
}
