export const canCapability = (profile, capability, action = 'read') => profile?.capabilities?.[capability]?.[action] === true;
export const moduleState = (profile, code) => profile?.modules?.find(module => module.code === code)?.state || 'disabled';
export function reportRequirements(spec = {}) {
  spec ||= {};
  const result = ['general_reports'];
  for (const [dimension, capability] of [['job', 'job_reports'], ['property', 'property_reports']]) {
    if ((dimension === 'job' && spec.reportKind === 'budget') || spec.groupBy?.includes(dimension)
      || ![null, undefined, ''].includes(spec.filters?.[`${dimension}Id`] ?? spec.filters?.[`${dimension}_id`])
      || (spec.reportKind === 'quality' && spec.qualityDimensions?.includes(dimension))) result.push(capability);
  }
  return result;
}
export const capabilityView = profile => ({ profile, ready: Boolean(profile),
  can: (capability, action) => canCapability(profile, capability, action),
  state: code => moduleState(profile, code),
  reportAllowed: (spec, action = 'read') => reportRequirements(spec).every(capability => canCapability(profile, capability, action)),
  scope: profile ? `${profile.company_id}:${profile.version}:${profile.role}` : '',
});
