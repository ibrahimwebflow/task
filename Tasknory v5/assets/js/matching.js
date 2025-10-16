import { supabase } from "../../supabase/config.js";

// Run matching for a job once it's approved
export async function runMatching(jobId) {
  try {
    // 1. Fetch job with payment_type
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("Job fetch error:", jobError?.message);
      return;
    }

    // NEW: Log payment type for debugging
    console.log(`Matching for job: ${job.title} (Payment type: ${job.payment_type})`);

    // 2. Fetch all available freelancers with skills
    const { data: freelancers, error: freelancerError } = await supabase
      .from("users")
      .select(`
        id,
        tone,
        language,
        available,
        freelancer_skills(skill_id, verified)
      `)
      .eq("role", "freelancer")
      .eq("available", true);

    if (freelancerError) {
      console.error("Freelancer fetch error:", freelancerError.message);
      return;
    }

    if (!freelancers || freelancers.length === 0) {
      console.log("No available freelancers for this job.");
      return;
    }

    // 3. Score freelancers
    const scored = freelancers.map(f => {
      let score = 0;

      const fSkills = f.freelancer_skills || [];
      const matchedSkills = fSkills.filter(s =>
        job.required_skill_ids?.includes(s.skill_id)
      );

      // ✅ Give more points for verified
      matchedSkills.forEach(s => {
        score += s.verified ? 20 : 5;
      });

      if (f.tone === job.preferred_tone) score += 3;
      if (f.language === job.language) score += 2;

      return { freelancer_id: f.id, score };
    });

    // 4. Sort by score, take top 3 OR less if fewer exist
    const topMatches = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(3, scored.length));

    if (topMatches.length === 0) {
      console.log("No matches found for this job.");
      return;
    }

    // 5. Store matches in DB
    for (let match of topMatches) {
      const { error: insertError } = await supabase.from("job_matches").insert({
        job_id: job.id,
        freelancer_id: match.freelancer_id,
        score: match.score,
        approved: false // must be confirmed by admin
      });

      if (insertError) {
        console.error("Error inserting match:", insertError);
      } else {
        console.log(`Created match for freelancer ${match.freelancer_id} with score ${match.score}`);
      }
    }

    console.log(`Stored ${topMatches.length} matches for job: ${job.title} (${job.payment_type} payment)`);
  } catch (err) {
    console.error("Matching failed:", err);
  }
}