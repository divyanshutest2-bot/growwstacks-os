import {
  InlineText,
  InlineTextarea,
  InlineSelect,
  InlineToggle,
} from '@/components/contacts/InlineField';
import {
  CONTACT_STATUSES,
  CONTACT_RATINGS,
  PLATFORMS,
  STATUS_LABEL,
  RATING_LABEL,
} from '@/lib/ui';
import type { ContactRollup } from '@/lib/types';
import type { CompanyOption } from '@/lib/actions/directory';

// ContactFields — the inline-editable field grid. Each field is its own
// auto-save client component (InlineField variants). No submit button.
export function ContactFields({
  contact,
  companies,
}: {
  contact: ContactRollup;
  companies: CompanyOption[];
}) {
  const statusOptions = CONTACT_STATUSES.map((s) => ({
    value: s,
    label: STATUS_LABEL[s],
  }));
  const ratingOptions = CONTACT_RATINGS.map((r) => ({
    value: r,
    label: RATING_LABEL[r],
  }));
  const platformOptions = PLATFORMS.map((p) => ({ value: p, label: p }));
  const companyOptions = companies.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const id = contact.id;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <InlineText contactId={id} field="full_name" label="Full name" value={contact.full_name} />
      <InlineText contactId={id} field="email" label="Email" value={contact.email} type="email" />
      <InlineText contactId={id} field="phone" label="Phone" value={contact.phone} />
      <InlineText contactId={id} field="whatsapp" label="WhatsApp" value={contact.whatsapp} />

      <InlineSelect
        contactId={id}
        field="status"
        label="Status"
        value={contact.status}
        options={statusOptions}
      />
      <InlineSelect
        contactId={id}
        field="rating"
        label="Rating"
        value={contact.rating}
        options={ratingOptions}
        allowEmpty
      />
      <InlineSelect
        contactId={id}
        field="main_platform"
        label="Main platform"
        value={contact.main_platform}
        options={platformOptions}
        allowEmpty
      />
      <InlineSelect
        contactId={id}
        field="company_id"
        label="Company"
        value={contact.company_id}
        options={companyOptions}
        allowEmpty
      />

      <InlineText contactId={id} field="country" label="Country" value={contact.country} />
      <InlineText contactId={id} field="city" label="City" value={contact.city} />
      <InlineText contactId={id} field="state" label="State" value={contact.state} />

      <InlineToggle
        contactId={id}
        field="is_client_portal_enabled"
        label="Client portal enabled"
        value={contact.is_client_portal_enabled}
      />

      <div className="md:col-span-2">
        <InlineTextarea
          contactId={id}
          field="about"
          label="About (markdown)"
          value={contact.about}
        />
      </div>
    </div>
  );
}
