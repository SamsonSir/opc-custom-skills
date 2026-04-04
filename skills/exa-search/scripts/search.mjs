import { Exa } from 'exa-js';

const exa = new Exa(process.env.EXA_API_KEY);
const query = process.argv[2] || 'OpenClaw';
const numResults = parseInt(process.argv[3]) || 5;

try {
  const results = await exa.search(query, { numResults });
  console.log(JSON.stringify(results, null, 2));
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
