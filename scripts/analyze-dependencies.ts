// scripts/analyze-dependencies.ts
import * as fs from 'fs';
import * as path from 'path';

interface FileInfo {
  path: string;
  imports: string[];
  exports: string[];
  importedBy: string[];
  isUsed: boolean;
  isEntryPoint: boolean;
  isApiRoute: boolean;
  isPage: boolean;
  isComponent: boolean;
}

class DependencyAnalyzer {
  private files: Map<string, FileInfo> = new Map();
  private projectRoot: string;
  private ignorePaths = [
    'node_modules',
    '.next',
    '.git',
    'dist',
    'build',
    '.env',
    'package-lock.json',
    'analyze-dependencies.ts' // This script itself
  ];

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async analyze() {
    console.log('🔍 Analyzing CareNav dependencies...\n');
    
    // Step 1: Find all TypeScript/JavaScript files
    this.findAllFiles(this.projectRoot);
    console.log(`📁 Found ${this.files.size} files\n`);

    // Step 2: Parse imports and exports
    this.parseImportsAndExports();

    // Step 3: Build dependency graph
    this.buildDependencyGraph();

    // Step 4: Mark entry points
    this.markEntryPoints();

    // Step 5: Trace usage from entry points
    this.traceUsage();

    // Step 6: Generate report
    this.generateReport();
  }

  private findAllFiles(dir: string, baseDir: string = '') {
    const items = fs.readdirSync(dir);

    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const relativePath = path.join(baseDir, item);

      // Skip ignored paths
      if (this.ignorePaths.some(ignore => relativePath.includes(ignore))) {
        return;
      }

      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        this.findAllFiles(fullPath, relativePath);
      } else if (item.match(/\.(ts|tsx|js|jsx)$/)) {
        this.files.set(relativePath, {
          path: relativePath,
          imports: [],
          exports: [],
          importedBy: [],
          isUsed: false,
          isEntryPoint: false,
          isApiRoute: relativePath.includes('app/api/') && item === 'route.ts',
          isPage: relativePath.includes('app/') && item === 'page.tsx',
          isComponent: relativePath.includes('components/') && item.endsWith('.tsx')
        });
      }
    });
  }

  private parseImportsAndExports() {
    this.files.forEach((fileInfo, filePath) => {
      try {
        const content = fs.readFileSync(
          path.join(this.projectRoot, filePath),
          'utf-8'
        );

        // Find imports
        const importRegex = /import\s+(?:(?:\{[^}]*\})|(?:[^;]+))\s+from\s+['"]([^'"]+)['"]/g;
        const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

        let match;
        while ((match = importRegex.exec(content)) !== null) {
          const importPath = this.resolveImportPath(match[1], filePath);
          if (importPath) {
            fileInfo.imports.push(importPath);
          }
        }

        while ((match = requireRegex.exec(content)) !== null) {
          const importPath = this.resolveImportPath(match[1], filePath);
          if (importPath) {
            fileInfo.imports.push(importPath);
          }
        }

        // Find exports
        const exportRegex = /export\s+(?:default\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/g;
        const exportDefaultRegex = /export\s+default\s+/g;

        while ((match = exportRegex.exec(content)) !== null) {
          fileInfo.exports.push(match[1]);
        }

        if (exportDefaultRegex.test(content)) {
          fileInfo.exports.push('default');
        }

      } catch (error) {
        console.error(`Error parsing ${filePath}:`, error);
      }
    });
  }

  private resolveImportPath(importPath: string, fromFile: string): string | null {
    // Skip node_modules imports
    if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
      return null;
    }

    // Handle @/ alias (assuming it maps to project root)
    if (importPath.startsWith('@/')) {
      importPath = importPath.replace('@/', './');
    }

    // Resolve relative imports
    const fromDir = path.dirname(fromFile);
    let resolvedPath = path.normalize(path.join(fromDir, importPath));

    // Try different extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
    for (const ext of extensions) {
      const testPath = resolvedPath + ext;
      if (this.files.has(testPath)) {
        return testPath;
      }
    }

    return null;
  }

  private buildDependencyGraph() {
    this.files.forEach((fileInfo, filePath) => {
      fileInfo.imports.forEach(importPath => {
        const importedFile = this.files.get(importPath);
        if (importedFile) {
          importedFile.importedBy.push(filePath);
        }
      });
    });
  }

  private markEntryPoints() {
    this.files.forEach(fileInfo => {
      // Entry points are pages, API routes, and the main layout
      if (fileInfo.isPage || fileInfo.isApiRoute || 
          fileInfo.path === 'app/layout.tsx' ||
          fileInfo.path === 'app/globals.css') {
        fileInfo.isEntryPoint = true;
        fileInfo.isUsed = true;
      }
    });
  }

  private traceUsage() {
    let changed = true;
    while (changed) {
      changed = false;
      this.files.forEach(fileInfo => {
        if (fileInfo.isUsed) {
          fileInfo.imports.forEach(importPath => {
            const importedFile = this.files.get(importPath);
            if (importedFile && !importedFile.isUsed) {
              importedFile.isUsed = true;
              changed = true;
            }
          });
        }
      });
    }
  }

  private generateReport() {
    const unused: FileInfo[] = [];
    const used: FileInfo[] = [];
    const orphaned: FileInfo[] = [];

    this.files.forEach(fileInfo => {
      if (!fileInfo.isUsed) {
        unused.push(fileInfo);
      } else {
        used.push(fileInfo);
      }

      // Orphaned = used but not imported by anything (except entry points)
      if (fileInfo.isUsed && !fileInfo.isEntryPoint && fileInfo.importedBy.length === 0) {
        orphaned.push(fileInfo);
      }
    });

    // Generate detailed report
    console.log('📊 DEPENDENCY ANALYSIS REPORT\n');
    console.log('='.repeat(50));
    
    console.log(`\n✅ USED FILES (${used.length}):`);
    console.log('-'.repeat(30));
    
    // Group by type
    const usedPages = used.filter(f => f.isPage);
    const usedApis = used.filter(f => f.isApiRoute);
    const usedComponents = used.filter(f => f.isComponent);
    const usedLibs = used.filter(f => f.path.startsWith('lib/'));
    const usedOther = used.filter(f => !f.isPage && !f.isApiRoute && !f.isComponent && !f.path.startsWith('lib/'));

    if (usedPages.length > 0) {
      console.log('\n📄 Pages:');
      usedPages.forEach(f => console.log(`  - ${f.path}`));
    }

    if (usedApis.length > 0) {
      console.log('\n🔌 API Routes:');
      usedApis.forEach(f => console.log(`  - ${f.path}`));
    }

    if (usedComponents.length > 0) {
      console.log('\n🧩 Components:');
      usedComponents.forEach(f => console.log(`  - ${f.path} (imported by ${f.importedBy.length} files)`));
    }

    if (usedLibs.length > 0) {
      console.log('\n📚 Libraries:');
      usedLibs.forEach(f => console.log(`  - ${f.path} (imported by ${f.importedBy.length} files)`));
    }

    console.log(`\n\n❌ UNUSED FILES (${unused.length}) - Safe to delete:`);
    console.log('-'.repeat(30));
    
    // Group unused by directory
    const unusedByDir: Record<string, FileInfo[]> = {};
    unused.forEach(f => {
      const dir = path.dirname(f.path);
      if (!unusedByDir[dir]) unusedByDir[dir] = [];
      unusedByDir[dir].push(f);
    });

    Object.entries(unusedByDir).forEach(([dir, files]) => {
      console.log(`\n📁 ${dir}/`);
      files.forEach(f => {
        console.log(`  - ${path.basename(f.path)}`);
      });
    });

    if (orphaned.length > 0) {
      console.log(`\n\n⚠️  ORPHANED FILES (${orphaned.length}) - Used but not imported:`);
      console.log('-'.repeat(30));
      orphaned.forEach(f => {
        console.log(`  - ${f.path}`);
      });
    }

    // Generate JSON report for further analysis
    const reportPath = path.join(this.projectRoot, 'dependency-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      summary: {
        total: this.files.size,
        used: used.length,
        unused: unused.length,
        orphaned: orphaned.length
      },
      unused: unused.map(f => f.path),
      orphaned: orphaned.map(f => f.path),
      dependencies: Object.fromEntries(
        Array.from(this.files.entries()).map(([path, info]) => [
          path,
          {
            imports: info.imports,
            importedBy: info.importedBy,
            isUsed: info.isUsed
          }
        ])
      )
    }, null, 2));

    console.log(`\n\n📄 Detailed report saved to: ${reportPath}`);

    // Generate deletion script
    if (unused.length > 0) {
      const deleteScript = unused.map(f => `rm "${f.path}"`).join('\n');
      const scriptPath = path.join(this.projectRoot, 'delete-unused.sh');
      fs.writeFileSync(scriptPath, `#!/bin/bash\n# Delete unused files\n\n${deleteScript}\n`);
      console.log(`\n🗑️  Deletion script saved to: ${scriptPath}`);
      console.log('   Run: chmod +x delete-unused.sh && ./delete-unused.sh');
    }
  }
}

// Run the analyzer
const analyzer = new DependencyAnalyzer(process.cwd());
analyzer.analyze().catch(console.error);