# 07 — Product Boundaries

**Status:** Explicit non-ownership list  

---

## LTC Manager is NOT

| Not this | Why | Integrate later? |
|----------|-----|------------------|
| **EHR / EMR** | Clinical documentation, orders, charts are different products and regulatory domains | Yes — read/write only if tightly scoped and consented |
| **Payroll** | Wage rules, tax, time clocks as pay systems of record | Yes — export hours later; never own paycheck |
| **Full HRIS** | Recruiting, benefits, performance reviews as enterprise HR | Partial **adjacent** HR already exists (points, separations) — do not expand into full HRIS |
| **Accounting / ERP GL** | G/L, AP/AR, procurement accounting | Export invoices later; never post books |
| **Warehouse / inventory accounting** | SKU costing, perpetual inventory | Ops PAR / shortage **signals** only |
| **Messaging-first platform** | Chat, channels, presence as core UX | Notifications/alerts later — not Slack clone |
| **Generic project / ticket SaaS** | Untethered task boards for any industry | Tasks exist to serve **operations**, not consulting firms |
| **BI / analytics home** | Warehouse-first dashboards | Review zone exports ok; Workspace ≠ looker |
| **Industry-only LTC package** | Locked forever to one care setting | LTC is beachhead; dining/healthcare/education expansion via configuration |

---

## What we may look like (but still own carefully)

| Adjacent surface | Boundary rule |
|------------------|---------------|
| Employee roster & discipline | Staffing and compliance support — not career platform |
| Menus | Operational production support — not recipe R&D cloud |
| Assets / PM | Service supportability — not CMMS for campuses of any type unless modes justify |
| Organization multi-facility | Access & structure — not corporate analytics suite |

---

## Future integrations (prefer buy/connect over build)

- Payroll providers (time export)  
- EHR census / unit census hooks (read-only where lawful)  
- SSO / IdP (enterprise wave)  
- Object storage for knowledge attachments  
- SMS/push gateways for **operational** alerts  
- Food distributor / procurement APIs for shortage signals  

Integrations enter through **Administration** and facility-scoped credentials — never as Workspace widgets that blur ownership.

---

## Expansion smell tests

Reject or redirect a feature if:

1. It requires a clinical, financial, or legal **system of record** we do not own.  
2. It invents a **fourth home** answering the same question as Workspace/OC/Today/Unit.  
3. It needs **org-wide averages** without explicit product research.  
4. It is “just a chatbot.”  
5. It duplicates readiness/issue rules in a new module “for convenience.”
