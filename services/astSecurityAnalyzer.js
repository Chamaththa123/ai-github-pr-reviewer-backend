const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const esquery = require('esquery');

const SECURITY_PATTERNS = {
  // SQL Injection patterns
  sqlInjection: {
    patterns: [
      'CallExpression[callee.property.name="query"][arguments.0.type="TemplateLiteral"]',
      'CallExpression[callee.property.name="execute"][arguments.0.type="TemplateLiteral"]',
      'CallExpression[callee.object.name="mysql"][callee.property.name="query"]'
    ],
    severity: 'critical',
    cwe: 'CWE-89',
    type: 'SQL Injection'
  },

  // Command Injection
  commandInjection: {
    patterns: [
      'CallExpression[callee.object.name="child_process"][callee.property.name="exec"]',
      'CallExpression[callee.name="exec"]',
      'CallExpression[callee.name="spawn"]'
    ],
    severity: 'critical',
    cwe: 'CWE-78',
    type: 'Command Injection'
  },

  // XSS vulnerabilities
  xss: {
    patterns: [
      'Property[key.name="dangerouslySetInnerHTML"]',
      'CallExpression[callee.property.name="innerHTML"]',
      'AssignmentExpression[left.property.name="innerHTML"]'
    ],
    severity: 'high',
    cwe: 'CWE-79',
    type: 'Cross-Site Scripting (XSS)'
  },

  // Hardcoded secrets
  hardcodedSecrets: {
    patterns: [
      'VariableDeclarator[id.name=/key|token|secret|password/i][init.type="Literal"]',
      'Property[key.name=/key|token|secret|password/i][value.type="Literal"]'
    ],
    severity: 'high',
    cwe: 'CWE-798',
    type: 'Hardcoded Credentials'
  },

  // Insecure random
  insecureRandom: {
    patterns: [
      'CallExpression[callee.object.name="Math"][callee.property.name="random"]'
    ],
    severity: 'medium',
    cwe: 'CWE-338',
    type: 'Weak Random Number Generation'
  },

  // Prototype pollution
  prototypePollution: {
    patterns: [
      'MemberExpression[object.name="Object"][property.name="prototype"]',
      'MemberExpression[property.name="__proto__"]',
      'MemberExpression[property.name="constructor"]'
    ],
    severity: 'high',
    cwe: 'CWE-1321',
    type: 'Prototype Pollution'
  },

  // Insecure deserialization
  insecureDeserialization: {
    patterns: [
      'CallExpression[callee.object.name="JSON"][callee.property.name="parse"]',
      'CallExpression[callee.name="eval"]'
    ],
    severity: 'high',
    cwe: 'CWE-502',
    type: 'Insecure Deserialization'
  }
};

const analyzeSecurityVulnerabilities = async (code, filename) => {
  const vulnerabilities = [];
  let complexity = 0;
  const metrics = {
    functions: 0,
    loops: 0,
    conditions: 0,
    depth: 0
  };

  try {
    const ast = parse(code, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'asyncGenerators',
        'functionBind',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'dynamicImport',
        'nullishCoalescingOperator',
        'optionalChaining'
      ]
    });

    // Analyze with esquery patterns
    Object.entries(SECURITY_PATTERNS).forEach(([key, config]) => {
      config.patterns.forEach(pattern => {
        try {
          const matches = esquery(ast, pattern);
          matches.forEach(match => {
            vulnerabilities.push({
              type: config.type,
              description: generateDescription(config.type, match, filename),
              location: getLocation(match),
              severity: config.severity,
              cwe: config.cwe,
              exploitability: getExploitability(config.severity),
              pattern: key
            });
          });
        } catch (patternError) {
          // Skip invalid patterns
        }
      });
    });

    // Calculate complexity and metrics
    traverse(ast, {
      FunctionDeclaration: (path) => {
        metrics.functions++;
        complexity += calculateCyclomaticComplexity(path.node);
      },
      ArrowFunctionExpression: (path) => {
        metrics.functions++;
        complexity += calculateCyclomaticComplexity(path.node);
      },
      WhileStatement: () => {
        metrics.loops++;
        complexity += 1;
      },
      ForStatement: () => {
        metrics.loops++;
        complexity += 1;
      },
      IfStatement: () => {
        metrics.conditions++;
        complexity += 1;
      },
      ConditionalExpression: () => {
        complexity += 1;
      }
    });

    // Additional manual security checks
    const manualChecks = performManualSecurityChecks(ast, code);
    vulnerabilities.push(...manualChecks);

  } catch (parseError) {
    console.warn(`Failed to parse ${filename} for AST analysis:`, parseError.message);
    
    // Fallback: regex-based analysis
    const regexFindings = performRegexSecurityAnalysis(code, filename);
    vulnerabilities.push(...regexFindings);
  }

  return {
    vulnerabilities: vulnerabilities.filter(v => v !== null),
    complexity: Math.round(complexity / Math.max(1, metrics.functions)),
    metrics
  };
};

function calculateCyclomaticComplexity(node) {
  let complexity = 1; // Base complexity
  
  // Add complexity for control structures
  if (node.type === 'IfStatement') complexity++;
  if (node.type === 'WhileStatement') complexity++;
  if (node.type === 'ForStatement') complexity++;
  if (node.type === 'ConditionalExpression') complexity++;
  
  return complexity;
}

function performManualSecurityChecks(ast, code) {
  const findings = [];
  
  // Check for sensitive data in console.log
  if (code.includes('console.log') && /console\.log.*(?:password|token|key|secret)/i.test(code)) {
    findings.push({
      type: 'Information Disclosure',
      description: 'Sensitive information may be logged to console',
      location: 'console.log statements',
      severity: 'medium',
      cwe: 'CWE-532',
      exploitability: 'low'
    });
  }
  
  // Check for HTTP usage instead of HTTPS
  if (/http:\/\/(?!localhost|127\.0\.0\.1)/i.test(code)) {
    findings.push({
      type: 'Insecure Communication',
      description: 'HTTP protocol used instead of HTTPS',
      location: 'HTTP URLs',
      severity: 'medium',
      cwe: 'CWE-319',
      exploitability: 'medium'
    });
  }
  
  // Check for weak cryptographic algorithms
  if (/\b(md5|sha1)\b/i.test(code)) {
    findings.push({
      type: 'Weak Cryptography',
      description: 'Weak cryptographic hash algorithm detected',
      location: 'Cryptographic functions',
      severity: 'medium',
      cwe: 'CWE-327',
      exploitability: 'medium'
    });
  }
  
  return findings;
}

function performRegexSecurityAnalysis(code, filename) {
  const findings = [];
  
  // Basic regex patterns for common vulnerabilities
  const patterns = [
    {
      regex: /password\s*[:=]\s*["'][^"']+["']/gi,
      type: 'Hardcoded Password',
      severity: 'high',
      cwe: 'CWE-798'
    },
    {
      regex: /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi,
      type: 'Hardcoded API Key',
      severity: 'high',
      cwe: 'CWE-798'
    },
    {
      regex: /eval\s*\(/gi,
      type: 'Code Injection',
      severity: 'critical',
      cwe: 'CWE-95'
    }
  ];
  
  patterns.forEach(pattern => {
    const matches = code.match(pattern.regex);
    if (matches) {
      findings.push({
        type: pattern.type,
        description: `${pattern.type} detected in ${filename}`,
        location: 'Multiple locations',
        severity: pattern.severity,
        cwe: pattern.cwe,
        exploitability: 'high'
      });
    }
  });
  
  return findings;
}

function generateDescription(type, node, filename) {
  const descriptions = {
    'SQL Injection': 'Potential SQL injection vulnerability found. Use parameterized queries.',
    'Command Injection': 'Command injection vulnerability detected. Validate and sanitize inputs.',
    'Cross-Site Scripting (XSS)': 'XSS vulnerability found. Sanitize user inputs and use safe rendering.',
    'Hardcoded Credentials': 'Hardcoded credentials detected. Use environment variables or secure vaults.',
    'Weak Random Number Generation': 'Weak random number generation. Use crypto.randomBytes() for security.',
    'Prototype Pollution': 'Potential prototype pollution vulnerability. Validate object properties.',
    'Insecure Deserialization': 'Insecure deserialization detected. Validate and sanitize input data.'
  };
  
  return descriptions[type] || `${type} vulnerability detected in ${filename}`;
}

function getLocation(node) {
  if (node.loc) {
    return `Line ${node.loc.start.line}, Column ${node.loc.start.column}`;
  }
  return 'Location unknown';
}

function getExploitability(severity) {
  const mapping = {
    'critical': 'high',
    'high': 'medium',
    'medium': 'low',
    'low': 'none'
  };
  return mapping[severity] || 'medium';
}

module.exports = {
  analyzeSecurityVulnerabilities,
  parseAST: parse
};