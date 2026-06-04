import {
  InlineText,
  InlineTextarea,
  InlineSelect,
} from '@/components/companies/InlineField';
import {
  COMPANY_TYPES,
  COMPANY_TYPE_LABEL,
  COMPANY_SIZES,
} from '@/lib/ui';
import type { CompanyRollup } from '@/lib/types';
import type { UserOption } from '@/lib/actions/directory';

// CompanyFields — the inline-editable field grid. Each field is its own
// auto-save client component (InlineField variants). No submit button.
//
// Ownership is a SINGLE FK (account_owner_id) → a plain inline select onto the
// users directory (NOT a multi-owner chip editor — the one structural
// difference from Contacts).
export function CompanyFields({
  company,
  users,
}: {
  company: CompanyRollup;
  users: UserOption[];
}) {
  const typeOptions = COMPANY_TYPES.map((t) => ({
    value: t,
    label: COMPANY_TYPE_LABEL[t],
  }));
  const sizeOptions = COMPANY_SIZES.map((s) => ({ value: s, label: s }));
  const ownerOptions = users.map((u) => ({
    value: u.id,
    label: u.full_name ?? u.email ?? u.id,
  }));

  const id = company.id;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <InlineText companyId={id} field="name" label="Name" value={company.name} />
      <InlineText
        companyId={id}
        field="website"
        label="Website"
        value={company.website}
        type="url"
      />

      <InlineText
        companyId={id}
        field="industry"
        label="Industry"
        value={company.industry}
      />
      <InlineSelect
        companyId={id}
        field="company_size"
        label="Company size"
        value={company.company_size}
        options={sizeOptions}
        allowEmpty
      />

      <InlineSelect
        companyId={id}
        field="type"
        label="Type"
        value={company.type}
        options={typeOptions}
        allowEmpty
      />
      <InlineSelect
        companyId={id}
        field="account_owner_id"
        label="Account owner"
        value={company.account_owner_id}
        options={ownerOptions}
        allowEmpty
      />

      <InlineText
        companyId={id}
        field="country"
        label="Country"
        value={company.country}
      />
      <InlineText companyId={id} field="city" label="City" value={company.city} />
      <InlineText
        companyId={id}
        field="state"
        label="State"
        value={company.state}
      />

      <div className="md:col-span-2">
        <InlineTextarea
          companyId={id}
          field="about"
          label="About (markdown)"
          value={company.about}
        />
      </div>
    </div>
  );
}
