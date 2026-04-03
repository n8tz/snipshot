import { describe, it, expect } from 'vitest';
import { readSourceFile, detectLanguage, findProjectRoot } from '../src/reader.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('readSourceFile', () => {
  it('reads a file and returns its content', () => {
    const content = readSourceFile(join(__dirname, 'fixtures/sample.java'));
    expect(content).toContain('SampleController');
  });

  it('throws on non-existent file', () => {
    expect(() => readSourceFile('/nonexistent/file.java')).toThrow();
  });
});

describe('detectLanguage', () => {
  it('detects java from .java extension', () => {
    expect(detectLanguage('Controller.java')).toBe('java');
  });

  it('detects typescript from .ts extension', () => {
    expect(detectLanguage('utils.ts')).toBe('typescript');
  });

  it('detects javascript from .js extension', () => {
    expect(detectLanguage('index.js')).toBe('javascript');
  });

  it('detects python from .py extension', () => {
    expect(detectLanguage('main.py')).toBe('python');
  });

  it('returns mapped name for known extensions', () => {
    expect(detectLanguage('file.rs')).toBe('rust');
  });

  it('detects tsx', () => {
    expect(detectLanguage('App.tsx')).toBe('tsx');
  });
});

describe('findProjectRoot', () => {
  it('uses custom root when provided', () => {
    const root = findProjectRoot('/some/file.ts', '/custom/root');
    expect(root).toBe('/custom/root');
  });

  it('falls back to cwd when no .git found', () => {
    const root = findProjectRoot('/tmp/random/file.ts');
    expect(typeof root).toBe('string');
  });
});
