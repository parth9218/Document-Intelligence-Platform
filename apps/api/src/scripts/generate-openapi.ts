import fs from 'fs';
import path from 'path';
import { swaggerSpec } from '../config/swagger';

const outputPath = process.env.SWAGGER_OUT || path.resolve(__dirname, '../../../../docs/context/api-specification.json');

try {
  // Ensure the target directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write spec as pretty formatted JSON
  fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2), 'utf8');
  console.log(`Successfully generated OpenAPI spec at: ${outputPath}`);
  process.exit(0);
} catch (error) {
  console.error('Failed to generate OpenAPI spec:', error);
  process.exit(1);
}
