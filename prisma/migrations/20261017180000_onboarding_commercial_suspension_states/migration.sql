-- Preserve Stripe suspension states separately from past-due grace. No historical backfill.
ALTER TYPE "FacilityBillingStatus" ADD VALUE 'UNPAID';
ALTER TYPE "FacilityBillingStatus" ADD VALUE 'PAUSED';
