// The legacy browser adapter used the donor database and did not enforce the
// target project's source-policy/authentication gates. Inventory research now
// runs in the authenticated BYBO workspace.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store')
  return response.status(410).json({
    error: 'Legacy browser scan retired. Run selected-dealer research in BYBO.',
    research_url: 'https://elite-market-intelligence.vercel.app/research',
  })
}
