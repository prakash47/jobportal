-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('CANDIDATE', 'RECRUITER');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_PROFILE_UPDATE';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_ORDER_CREATED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_SUBSCRIPTION_ACTIVATED';
ALTER TYPE "ProfileAuditAction" ADD VALUE 'BILLING_PAYMENT_FAILED';

-- AlterTable
ALTER TABLE "JobAlert" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "companyId" INTEGER;

-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN     "buyerSnapshot" JSONB,
ADD COLUMN     "cgstInPaise" INTEGER,
ADD COLUMN     "companyId" INTEGER,
ADD COLUMN     "gstRateBps" INTEGER,
ADD COLUMN     "igstInPaise" INTEGER,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "paymentOrderId" INTEGER,
ADD COLUMN     "pdfKey" TEXT,
ADD COLUMN     "placeOfSupply" TEXT,
ADD COLUMN     "sgstInPaise" INTEGER,
ADD COLUMN     "taxableInPaise" INTEGER,
DROP COLUMN "status",
ADD COLUMN     "status" "InvoiceStatus" NOT NULL;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "audience" "PlanAudience" NOT NULL DEFAULT 'CANDIDATE';

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyBillingProfile" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "legalName" TEXT NOT NULL,
    "gstin" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "billingEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_razorpayOrderId_key" ON "PaymentOrder"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_razorpayPaymentId_key" ON "PaymentOrder"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "PaymentOrder_companyId_createdAt_idx" ON "PaymentOrder"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentOrder_status_idx" ON "PaymentOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_eventId_key" ON "PaymentWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_eventType_createdAt_idx" ON "PaymentWebhookEvent"("eventType", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBillingProfile_companyId_key" ON "CompanyBillingProfile"("companyId");

-- CreateIndex
CREATE INDEX "Subscription_companyId_status_idx" ON "Subscription"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_paymentOrderId_key" ON "SubscriptionInvoice"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_invoiceNumber_key" ON "SubscriptionInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_companyId_createdAt_idx" ON "SubscriptionInvoice"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SubscriptionPlan_audience_isActive_isPublic_idx" ON "SubscriptionPlan"("audience", "isActive", "isPublic");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBillingProfile" ADD CONSTRAINT "CompanyBillingProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the seeded enterprise plan is a recruiter-team plan (its
-- featureKeys are recruiter.*). The seed upsert uses `update: {}` so it never
-- mutates existing rows — this backfill is the only path that reclassifies
-- already-seeded databases. The three candidate plans keep the CANDIDATE default.
UPDATE "SubscriptionPlan" SET "audience" = 'RECRUITER' WHERE "slug" = 'enterprise-yearly';
