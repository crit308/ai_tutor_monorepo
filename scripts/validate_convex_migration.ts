/**
 * Convex Migration Validation Script - Day 15
 * 
 * This script validates the completion of the Convex migration MVP
 * as defined in the "skill move to convex.md" roadmap.
 */

const { ConvexHttpClient } = require("convex/browser");
const { api } = require("../convex/_generated/api");

// Configuration
const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
const TEST_SESSION_ID = "validation-test-session";

async function validateConvexMigration() {
  if (!CONVEX_URL) {
    console.error("❌ CONVEX_URL environment variable not found");
    console.log("Please check your .env.local file or set CONVEX_URL");
    process.exit(1);
  }

  console.log("🚀 Starting Convex Migration Validation...");
  console.log(`📡 Connecting to: ${CONVEX_URL}\n`);

  const convex = new ConvexHttpClient(CONVEX_URL);

  try {
    // Test 1: Validate Day 15 implementation
    console.log("1️⃣ Testing Day 15 Implementation...");
    const day15Validation = await convex.query(api.migrations.finalize_skill_migration.validateDay15Implementation);
    
    console.log(`   Status: ${day15Validation.status}`);
    console.log(`   Functions Available: ${day15Validation.functions_available.length}/5`);
    console.log(`   Implementation Complete: ${day15Validation.implementation_complete ? "✅" : "❌"}`);
    
    if (!day15Validation.implementation_complete) {
      console.log("   ❌ Day 15 implementation incomplete");
      return false;
    }

    // Test 2: MVP Success Criteria Validation
    console.log("\n2️⃣ Testing MVP Success Criteria...");
    const mvpResults = await convex.query(api.migrations.finalize_skill_migration.validateMVPSuccess, {
      time_range_hours: 168 // 7 days
    });
    
    console.log(`   Skills: ${mvpResults.skills} (Target: ≤10)`);
    console.log(`   Latency Improvement: ${mvpResults.latency_improvement} (Target: ≥40%)`);
    console.log(`   Timeout Errors: ${mvpResults.timeout_errors} (Target: 0)`);
    console.log(`   WebSocket Reduction: ${mvpResults.websocket_reduction} (Target: ≥60%)`);
    console.log(`   Migration Status: ${mvpResults.migration_status}`);
    console.log(`   Overall Success: ${mvpResults.all_success ? "✅" : "❌"}`);

    // Test 3: Migration Status Report
    console.log("\n3️⃣ Getting Migration Status Report...");
    const statusReport = await convex.query(api.migrations.finalize_skill_migration.getMigrationStatusReport);
    
    console.log(`   Phase: ${statusReport.migration_phase}`);
    console.log(`   Progress: ${statusReport.implementation_progress}`);
    console.log(`   Active Skills: ${statusReport.active_skills.length}`);
    console.log(`   Performance Summary:`);
    console.log(`     - Avg Latency: ${statusReport.performance_summary.avg_latency_ms}ms`);
    console.log(`     - Success Rate: ${(statusReport.performance_summary.success_rate * 100).toFixed(1)}%`);
    console.log(`     - Total Calls (7d): ${statusReport.performance_summary.total_calls_week}`);

    // Test 4: Generate test data if no recent metrics
    if (statusReport.performance_summary.total_calls_week === 0) {
      console.log("\n4️⃣ Generating Test Data (No recent metrics found)...");
      const testDataResult = await convex.mutation(api.migrations.finalize_skill_migration.generateValidationTestData, {
        session_id: TEST_SESSION_ID,
        sample_count: 100
      });
      
      console.log(`   Test Data Generated: ${testDataResult.success ? "✅" : "❌"}`);
      console.log(`   Sample Count: ${testDataResult.generated_count}`);
      console.log(`   Message: ${testDataResult.message}`);

      if (testDataResult.success) {
        // Re-run MVP validation with test data
        console.log("\n   Re-validating MVP criteria with test data...");
        const updatedMvpResults = await convex.query(api.migrations.finalize_skill_migration.validateMVPSuccess, {
          time_range_hours: 1 // Last hour since we just generated data
        });
        
        console.log(`   Updated Latency Improvement: ${updatedMvpResults.latency_improvement}`);
        console.log(`   Updated WebSocket Reduction: ${updatedMvpResults.websocket_reduction}`);
        console.log(`   Updated Overall Success: ${updatedMvpResults.all_success ? "✅" : "❌"}`);
      }
    }

    // Test 5: Rollout Readiness
    console.log("\n5️⃣ Checking Rollout Readiness...");
    const rolloutReadiness = await convex.query(api.validate_day15_complete.validateMigrationRolloutReadiness);
    
    console.log(`   Rollout Ready: ${rolloutReadiness.rollout_ready ? "✅" : "❌"}`);
    console.log(`   Readiness Score: ${rolloutReadiness.readiness_score}%`);
    console.log(`   Checklist:`);
    Object.entries(rolloutReadiness.checklist).forEach(([key, value]) => {
      console.log(`     - ${key}: ${value ? "✅" : "❌"}`);
    });

    // Test 6: Completion Certificate
    console.log("\n6️⃣ Generating Completion Certificate...");
    const certificate = await convex.query(api.validate_day15_complete.generateMigrationCompletionCertificate);
    
    console.log(`   Certificate Valid: ${certificate.certificate_valid ? "✅" : "❌"}`);
    console.log(`   Completion Date: ${certificate.completion_date}`);
    console.log(`   Performance Summary:`);
    console.log(`     - Skills Reduced: ${certificate.performance_summary.skills_reduced_from} → ${certificate.performance_summary.skills_reduced_to}`);
    console.log(`     - Latency Improvement: ${certificate.performance_summary.latency_improvement}`);
    console.log(`     - Timeout Elimination: ${certificate.performance_summary.timeout_elimination ? "✅" : "❌"}`);
    console.log(`     - WebSocket Efficiency: ${certificate.performance_summary.websocket_efficiency}`);
    console.log(`   Rollout Approval: ${certificate.rollout_approval ? "✅" : "❌"}`);

    // Final Results
    console.log("\n" + "=".repeat(60));
    console.log("🎯 CONVEX MIGRATION VALIDATION RESULTS");
    console.log("=".repeat(60));
    
    if (mvpResults.all_success && rolloutReadiness.rollout_ready) {
      console.log("🎉 SUCCESS! Convex migration is COMPLETE and ready for production rollout!");
      console.log("\n✅ All MVP criteria successfully met:");
      console.log(`   • Skills consolidated: ${mvpResults.skills}`);
      console.log(`   • Performance improved: ${mvpResults.latency_improvement}`);
      console.log(`   • Timeouts eliminated: ${mvpResults.timeout_errors} errors`);
      console.log(`   • WebSocket optimized: ${mvpResults.websocket_reduction} reduction`);
      
      console.log("\n🚀 Next Steps:");
      console.log("   1. Begin gradual production rollout: 5% → 25% → 50% → 100%");
      console.log("   2. Monitor performance metrics during rollout");
      console.log("   3. Complete legacy Python backend deprecation");
      
      return true;
    } else {
      console.log("⚠️ Migration in progress. Not all criteria met yet.");
      console.log("\n❌ Remaining tasks:");
      
      if (!mvpResults.details.skill_count_success) {
        console.log("   • Reduce skill count to ≤10");
      }
      if (!mvpResults.details.latency_improvement_success) {
        console.log("   • Achieve ≥40% latency improvement");
      }
      if (!mvpResults.details.timeout_errors_success) {
        console.log("   • Eliminate timeout errors");
      }
      if (!mvpResults.details.websocket_reduction_success) {
        console.log("   • Achieve ≥60% WebSocket reduction");
      }
      
      console.log("\n📋 Current Status:");
      console.log(`   • Criteria met: ${Object.values(mvpResults.details).filter(Boolean).length}/4`);
      console.log(`   • Readiness score: ${rolloutReadiness.readiness_score}%`);
      
      return false;
    }

  } catch (error) {
    console.error("❌ Validation failed with error:", error);
    return false;
  }
}

// Run validation if this file is executed directly
if (require.main === module) {
  validateConvexMigration()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("❌ Unexpected error:", error);
      process.exit(1);
    });
}

module.exports = { validateConvexMigration }; 