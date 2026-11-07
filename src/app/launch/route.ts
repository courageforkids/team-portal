/** Old home-screen start address. Phones that saved it go straight to the portal. */
export function GET(req: Request) {
  return Response.redirect(new URL("/", req.url), 308);
}
