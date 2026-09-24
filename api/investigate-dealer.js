// Arbitrary-host legacy investigation bypassed the reviewed dealer-source
// policy. Selected-dealer research is available in the canonical BYBO app.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store')
  return response.status(410).json({
    error: 'Legacy investigation retired. Use the BYBO research workspace.',
    research_url: 'https://elite-market-intelligence.vercel.app/research',
  })
}
