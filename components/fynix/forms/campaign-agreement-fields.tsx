"use client";

import { DEFAULT_COUNTING_RULES } from "@/lib/fynix/campaign-terms";
import { FormGroup, SelectField, TextAreaField } from "./form-parts";

/**
 * The agreement step of a new campaign. A campaign cannot go live until the client and the coordinator have both accepted its agreement, so the form
 * asks about it before the campaign is made instead of leaving it to be remembered. The numbers are the ones on the Campaign tab; the counting rules
 * start from the standard ones and can be changed. Publishing now tells the managers of both sides.
 */
export function AgreementFields() {
  return (
    <FormGroup title="Agreement">
      <p className="text-body text-ink-2 md:col-span-2">
        The client and the coordinator both accept the agreement before the campaign can go live. It carries the meetings per month and in total from the Campaign tab, and the counting rules below.
      </p>
      <SelectField
        name="publishAgreement"
        label="When to publish it"
        defaultValue="now"
        options={[
          { value: "now", label: "Now, when the campaign is created" },
          { value: "later", label: "Later, from the campaign page" },
        ]}
        helper="Publishing tells the managers of the client and of the coordinator that they need to accept it."
      />
      <div className="md:col-span-2">
        <TextAreaField name="agreementRules" label="Counting rules" defaultValue={DEFAULT_COUNTING_RULES} helper="When a meeting counts, including no-shows, in words. It starts from the standard rules." />
      </div>
    </FormGroup>
  );
}
