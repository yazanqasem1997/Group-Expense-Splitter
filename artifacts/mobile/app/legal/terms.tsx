import React from "react";
import { termsSections } from "@/constants/legalText";
import { LegalDocumentScreen } from "@/components/LegalDocumentScreen";
import { LEGAL_LAST_UPDATED, OPERATOR_DESCRIPTION, SUPPORT_EMAIL } from "@/constants/brand";

const sections = termsSections;

export default function TermsScreen() {
  return (
    <LegalDocumentScreen
      title="Terms of Service"
      subtitle="The rules for using Split Mate."
      lastUpdated={LEGAL_LAST_UPDATED}
      sections={sections}
      relatedDocument={{ label: "Read Privacy Policy", path: "/legal/privacy" }}
    />
  );
}
