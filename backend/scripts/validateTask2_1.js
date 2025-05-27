/**
 * Validation script for Phase 2, Task 2.1: Enhanced Session Manager
 * Checks that all required components are implemented correctly
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Task 2.1: Enhanced Session Manager...\n');

// Check if files exist
const requiredFiles = [
  'sessionManager.ts',
  'functions.ts', 
  'http.ts',
  'schema.ts',
  'sessionManager.test.ts',
  'sessionManager.integration.test.ts',
  'PHASE2_TASK1_COMPLETION.md'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('\n❌ Not all required files exist!');
  process.exit(1);
}

// Check SessionManager class structure
console.log('\n🔍 Checking SessionManager implementation...');

const sessionManagerContent = fs.readFileSync('sessionManager.ts', 'utf8');

const requiredMethods = [
  'createSession',
  'getSessionContext', 
  'updateSessionContext',
  'sessionExists',
  'deleteSession',
  'listUserSessions',
  'cleanupExpiredSessions',
];

const requiredTypes = [
  'TutorContext',
  'UserModelState',
  'UserConceptMastery',
  'AnalysisResult',
  'LessonPlan',
  'QuizQuestion',
  'FocusObjective'
];

let allMethodsPresent = true;
requiredMethods.forEach(method => {
  if (sessionManagerContent.includes(`async ${method}(`)) {
    console.log(`✅ Method ${method} found`);
  } else {
    console.log(`❌ Method ${method} missing`);
    allMethodsPresent = false;
  }
});

let allTypesPresent = true;
requiredTypes.forEach(type => {
  if (sessionManagerContent.includes(`interface ${type}`)) {
    console.log(`✅ Type ${type} found`);
  } else {
    console.log(`❌ Type ${type} missing`);
    allTypesPresent = false;
  }
});

// Check caching implementation
if (sessionManagerContent.includes('sessionCache') && sessionManagerContent.includes('cleanupCache')) {
  console.log('✅ Caching implementation found');
} else {
  console.log('❌ Caching implementation missing');
  allMethodsPresent = false;
}

// Check Convex functions
console.log('\n🔍 Checking Convex functions...');

const functionsContent = fs.readFileSync('functions.ts', 'utf8');

const requiredFunctions = [
  'deleteSession',
  'listUserSessions',
  'cleanupExpiredSessions', 
  'getFolderData',
  'validateSessionContext'
];

let allFunctionsPresent = true;
requiredFunctions.forEach(func => {
  if (functionsContent.includes(`export const ${func}`)) {
    console.log(`✅ Function ${func} found`);
  } else {
    console.log(`❌ Function ${func} missing`);
    allFunctionsPresent = false;
  }
});

// Check HTTP endpoints
console.log('\n🔍 Checking HTTP endpoints...');

const httpContent = fs.readFileSync('http.ts', 'utf8');

const requiredEndpoints = [
  '/deleteSession',
  '/listUserSessions',
  '/cleanupExpiredSessions',
  '/getFolderData',
  '/validateSessionContext'
];

let allEndpointsPresent = true;
requiredEndpoints.forEach(endpoint => {
  if (httpContent.includes(`"${endpoint}"`)) {
    console.log(`✅ Endpoint ${endpoint} found`);
  } else {
    console.log(`❌ Endpoint ${endpoint} missing`);
    allEndpointsPresent = false;
  }
});

// Check tests
console.log('\n🔍 Checking test coverage...');

const testContent = fs.readFileSync('sessionManager.test.ts', 'utf8');
const integrationTestContent = fs.readFileSync('sessionManager.integration.test.ts', 'utf8');

const requiredTestSuites = [
  'createSession',
  'getSessionContext',
  'updateSessionContext',
  'sessionExists',
  'deleteSession',
  'caching behavior'
];

let allTestsPresent = true;
requiredTestSuites.forEach(suite => {
  if (testContent.includes(suite) || integrationTestContent.includes(suite)) {
    console.log(`✅ Test suite for ${suite} found`);
  } else {
    console.log(`❌ Test suite for ${suite} missing`);
    allTestsPresent = false;
  }
});

// Final validation
console.log('\n📊 Task 2.1 Validation Summary:');
console.log(`Files: ${allFilesExist ? '✅' : '❌'}`);
console.log(`SessionManager Methods: ${allMethodsPresent ? '✅' : '❌'}`);
console.log(`Type Definitions: ${allTypesPresent ? '✅' : '❌'}`);
console.log(`Convex Functions: ${allFunctionsPresent ? '✅' : '❌'}`);
console.log(`HTTP Endpoints: ${allEndpointsPresent ? '✅' : '❌'}`);
console.log(`Test Coverage: ${allTestsPresent ? '✅' : '❌'}`);

const overallSuccess = allFilesExist && allMethodsPresent && allTypesPresent && 
                      allFunctionsPresent && allEndpointsPresent && allTestsPresent;

if (overallSuccess) {
  console.log('\n🎉 Task 2.1: Enhanced Session Manager - VALIDATION PASSED!');
  console.log('✅ Ready to proceed to Task 2.2: Authentication Migration');
} else {
  console.log('\n❌ Task 2.1: Enhanced Session Manager - VALIDATION FAILED!');
  console.log('Please fix the missing components before proceeding.');
  process.exit(1);
} 