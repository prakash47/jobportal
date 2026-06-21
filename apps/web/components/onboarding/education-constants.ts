// Sentinel stored in Education.degree to mark the "Class 12" row of the
// structured onboarding education form. The Class 12 section has no user-facing
// degree field, so we own this value entirely — it round-trips which Education
// row is the degree vs Class 12 on prefill, without a schema discriminator.
export const CLASS12_DEGREE = 'Class XII';
