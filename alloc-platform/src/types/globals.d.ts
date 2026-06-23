/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Allows importing CSS files as side-effects
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
