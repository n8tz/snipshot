export function processUserRegistration(firstName: string, lastName: string, email: string, phoneNumber: string, address: string, city: string, country: string, postalCode: string): Promise<{ userId: string; confirmationToken: string; registrationDate: Date }> {
  const validationResult = validateAllFields(firstName, lastName, email, phoneNumber, address, city, country, postalCode);
  if (!validationResult.isValid) {
    throw new Error(`Validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
  }
  return createUser({ firstName, lastName, email, phoneNumber, address, city, country, postalCode });
}
