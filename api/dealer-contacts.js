// Contact discovery/review moved to the authenticated BYBO workspace. The
// donor-era API used a public application key for writes and must not be
// retargeted to the consolidated database without an authorization review.
export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store')
  return response.status(410).json({
    error: 'Legacy contact crawler retired. Run contact research in BYBO.',
    research_url: 'https://elite-market-intelligence.vercel.app/research',
  })
}
