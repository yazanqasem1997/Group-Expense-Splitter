import React from "react";
import { privacySections } from "@/constants/legalText";
import { LegalDocumentScreen } from "@/components/LegalDocumentScreen";
import { LEGAL_LAST_UPDATED, OPERATOR_DESCRIPTION, SUPPORT_EMAIL } from "@/constants/brand";

const sections = privacySections;

export default function PrivacyScreen() {
  return (
    <LegalDocumentScreen
      title="Privacy Policy"
      subtitle="What Split Mate collects, why, and the choices you have."
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={sections}
      relatedDocument={{ label: "Read Terms of Service", path: "/legal/terms" }}
    />
  );
}
