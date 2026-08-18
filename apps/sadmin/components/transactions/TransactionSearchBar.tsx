'use client';

import { AdminSearchBar } from '../AdminSearchBar';

/** Search for the Transaction & Revenue Log. See ../AdminSearchBar. */
export function TransactionSearchBar() {
  return (
    <AdminSearchBar
      placeholder="Search by company, invoice number or gateway id…"
      // The label states the scope so an admin is not searching blind. These
      // four fields are exactly what someone arrives holding: a company name, an
      // invoice number from an accountant, or an order/payment id copied out of
      // the Razorpay dashboard. It does NOT match the plan name or an amount.
      label="Search transactions by company, invoice number or gateway id"
    />
  );
}
