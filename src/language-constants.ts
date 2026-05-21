/*
 * Purpose: Defines SemLang language-wide constant sets shared by parser, resolver, and emitters.
 * Encapsulation: Keep syntax vocabulary here when it is stable and reused across compiler phases; phase-specific validation rules belong in that phase's module.
 */

export const primitiveTypes = new Set(["string", "number", "date", "timestamp", "currency", "boolean"]);
