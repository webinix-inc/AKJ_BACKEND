// Frontend Integration Code for Sample Document Download
// Add this to your TestDetailsPage.jsx component

const SAMPLE_DOCUMENT_INTEGRATION = `
// 1. Add state for sample document info
const [sampleDocInfo, setSampleDocInfo] = useState(null);
const [showSampleModal, setShowSampleModal] = useState(false);

// 2. Fetch sample document info
const fetchSampleDocumentInfo = async () => {
  try {
    const response = await api.get('/api/v1/sample-document/info');
    setSampleDocInfo(response.data.info);
  } catch (error) {
    console.error('Error fetching sample document info:', error);
    toast.error('Failed to load sample document information');
  }
};

// 3. Download sample document
const downloadSampleDocument = async () => {
  try {
    const response = await api.get('/api/v1/sample-document/download', {
      responseType: 'blob'
    });
    
    // Create blob and download
    const blob = new Blob([response.data], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample-math-questions-template.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    toast.success('Sample document downloaded successfully!');
  } catch (error) {
    console.error('Error downloading sample document:', error);
    toast.error('Failed to download sample document');
  }
};

// 4. Load sample info on component mount
useEffect(() => {
  fetchSampleDocumentInfo();
}, []);

// 5. Add Sample Document Button to Upload Modal
const SampleDocumentButton = () => (
  <div className="mb-4 p-4 bg-blue-900 rounded-lg border border-blue-600">
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-blue-200 font-semibold">📄 Need Help with Format?</h4>
      <button
        onClick={() => setShowSampleModal(true)}
        className="text-blue-300 hover:text-blue-100 text-sm underline"
      >
        View Details
      </button>
    </div>
    <p className="text-blue-300 text-sm mb-3">
      Download our sample template to see the exact format required for mathematical questions.
    </p>
    <button
      onClick={downloadSampleDocument}
      className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Download Sample Template
    </button>
  </div>
);

// 6. Sample Document Info Modal
const SampleDocumentModal = () => (
  showSampleModal && sampleDocInfo && (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-[#0d0d0d] w-3/4 max-w-4xl p-6 rounded-lg shadow-lg text-gray-200 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">📄 Sample Document Template</h3>
          <button
            onClick={() => setShowSampleModal(false)}
            className="text-gray-400 hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h4 className="text-green-400 font-semibold mb-2">📊 Template Statistics</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Questions:</span>
                <span className="text-green-400">{sampleDocInfo.questionCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Options:</span>
                <span className="text-blue-400">{sampleDocInfo.optionCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Math Expressions:</span>
                <span className="text-purple-400">{sampleDocInfo.mathExpressions}</span>
              </div>
              <div className="flex justify-between">
                <span>File Size:</span>
                <span className="text-yellow-400">{(sampleDocInfo.fileSize / 1024).toFixed(1)} KB</span>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <h4 className="text-blue-400 font-semibold mb-2">🧮 Supported Math Symbols</h4>
            <div className="text-sm space-y-1">
              {sampleDocInfo.supportedMathSymbols.map((symbol, index) => (
                <div key={index} className="text-gray-300">• {symbol}</div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 p-4 rounded-lg mb-6">
          <h4 className="text-yellow-400 font-semibold mb-2">📋 Instructions</h4>
          <ol className="text-sm space-y-1">
            {sampleDocInfo.instructions.map((instruction, index) => (
              <li key={index} className="text-gray-300">
                {index + 1}. {instruction}
              </li>
            ))}
          </ol>
        </div>
        
        <div className="bg-gray-800 p-4 rounded-lg mb-6">
          <h4 className="text-purple-400 font-semibold mb-2">✨ Features Included</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {sampleDocInfo.features.map((feature, index) => (
              <div key={index} className="text-gray-300">• {feature}</div>
            ))}
          </div>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-400">
            Format: {sampleDocInfo.format}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowSampleModal(false)}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
            <button
              onClick={() => {
                downloadSampleDocument();
                setShowSampleModal(false);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Download Template
            </button>
          </div>
        </div>
      </div>
    </div>
  )
);

// 7. Update the existing upload modal to include the sample document button
// Replace the existing upload modal content with:
const EnhancedUploadModal = () => (
  showModal && (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-[#0d0d0d] w-1/2 p-6 rounded-lg shadow-lg text-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Upload Questions</h3>
          <button
            onClick={() => setShowModal(false)}
            className="text-gray-400 hover:text-gray-200"
          >
            <MdClose size={24} />
          </button>
        </div>
        
        {/* Sample Document Section */}
        <SampleDocumentButton />
        
        {/* File Upload Section */}
        <div className="border-t border-gray-600 pt-4">
          <label className="block text-gray-300 text-sm font-medium mb-2">
            Select Word Document (.doc, .docx)
          </label>
          <input
            type="file"
            accept=".doc, .docx"
            onChange={handleUpload}
            className="w-full px-4 py-2 bg-gray-800 text-white rounded-md border border-gray-600"
          />
          <p className="text-xs text-gray-400 mt-2">
            Make sure your document follows the sample template format for best results.
          </p>
        </div>
      </div>
    </div>
  )
);

// 8. Add the Sample Document Modal to your JSX return
// Add this before the closing div of your component:
{/* Sample Document Info Modal */}
<SampleDocumentModal />
`;

console.log('🌐 FRONTEND INTEGRATION CODE GENERATED');
console.log('='.repeat(60));
console.log('📋 INTEGRATION STEPS:');
console.log('1. Add the state variables to your TestDetailsPage component');
console.log('2. Add the API functions (fetchSampleDocumentInfo, downloadSampleDocument)');
console.log('3. Replace your upload modal with the enhanced version');
console.log('4. Add the SampleDocumentModal component');
console.log('5. Import any missing dependencies (toast, api)');
console.log('');
console.log('📄 FEATURES INCLUDED:');
console.log('• Download sample template button');
console.log('• Detailed information modal');
console.log('• Template statistics display');
console.log('• Supported math symbols list');
console.log('• Step-by-step instructions');
console.log('• File format validation info');
console.log('');
console.log('🎯 API ENDPOINTS:');
console.log('• GET /api/v1/sample-document/info - Document information');
console.log('• GET /api/v1/sample-document/download - Download template');
console.log('');
console.log('✅ READY FOR FRONTEND IMPLEMENTATION!');

// Save the integration code to a file for easy reference
const fs = require('fs');
const path = require('path');

const integrationFilePath = path.join(__dirname, 'FRONTEND_SAMPLE_DOWNLOAD_INTEGRATION.md');

const markdownContent = `# Frontend Sample Document Download Integration

## Overview
This guide shows how to integrate the sample document download feature into the admin frontend.

## API Endpoints
- \`GET /api/v1/sample-document/info\` - Get document information
- \`GET /api/v1/sample-document/download\` - Download sample template

## Integration Code

### 1. State Variables
Add these to your TestDetailsPage component:

\`\`\`javascript
const [sampleDocInfo, setSampleDocInfo] = useState(null);
const [showSampleModal, setShowSampleModal] = useState(false);
\`\`\`

### 2. API Functions
${SAMPLE_DOCUMENT_INTEGRATION}

## Features
- ✅ Download sample template button
- ✅ Detailed information modal  
- ✅ Template statistics display
- ✅ Supported math symbols list
- ✅ Step-by-step instructions
- ✅ File format validation info

## Usage
1. User clicks "Download Sample Template" button
2. System downloads the template file
3. User can view detailed information in modal
4. User follows the template format for uploads
5. System processes uploaded documents correctly

## Benefits
- Reduces upload errors
- Provides clear formatting guidelines
- Shows supported mathematical notation
- Improves user experience
- Ensures data consistency
`;

try {
  fs.writeFileSync(integrationFilePath, markdownContent, 'utf8');
  console.log(`📄 Integration guide saved to: ${integrationFilePath}`);
} catch (error) {
  console.error('❌ Error saving integration guide:', error);
}

module.exports = {
  SAMPLE_DOCUMENT_INTEGRATION,
  integrationFilePath
};
