// merithub.service.js
'use strict';

const axios = require('axios');
const jwt = require('jsonwebtoken');

const CLIENT_ID = process.env.MERIT_HUB_CLIENT_ID;
const CLIENT_SECRET = process.env.MERIT_HUB_SECRET_KEY;
const STRICT_SECRET_CHECK = String(process.env.MERIT_HUB_STRICT_SECRET_CHECK || 'false').toLowerCase() === 'true';

const BASE_URL = 'https://serviceaccount1.meritgraph.com/v1';
const CLASS_BASE_URL = 'https://class1.meritgraph.com/v1';

let accessToken = null;
let tokenExpiry = 0; // epoch ms

// --------------------------- Utils ---------------------------

function nowMs() { return Date.now(); }

function assertEnv() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('MeritHub CLIENT_ID and CLIENT_SECRET must be configured in environment variables');
  }
  // Soft check: warn if it *looks* like bcrypt; only hard-fail when STRICT is on.
  const looksBcrypt = /^\$2[aby]\$\d{2}\$/.test(CLIENT_SECRET);
  if (looksBcrypt) {
    const msg = 'MERIT_HUB_SECRET_KEY looks like a bcrypt hash ($2x$...). JWT HMAC typically requires the *plain* secret.';
    if (STRICT_SECRET_CHECK) throw new Error(msg);
    console.warn('⚠️', msg, '(Proceeding because STRICT check is off)');
  }
}

function diagSecretShape() {
  const val = CLIENT_SECRET || '';
  return {
    length: val.length,
    startsWith: val.slice(0, 4),
    bcryptLike: /^\$2[aby]\$\d{2}\$/.test(val),
  };
}

// ---------------------- JWT Generation -----------------------

function generateJwt() {
  assertEnv();
  const iat = Math.floor(nowMs() / 1000);

  // Standard claims + their sample's `expiry`
  const payload = {
    iss: CLIENT_ID,
    aud: `https://serviceaccount1.meritgraph.com/v1/${CLIENT_ID}/api/token`,
    iat,
    exp: iat + 3600,
    expiry: 3600
  };

  console.log('🔑 Generating JWT with payload:', payload);
  // HS256
  const merithubJwt = jwt.sign(payload, CLIENT_SECRET, { algorithm: 'HS256' });

  // Debug (safe): only show header + a peek at payload
  const decoded = jwt.decode(merithubJwt, { complete: true }) || {};
  console.log('🔍 JWT header:', decoded.header);
  console.log('🔍 JWT payload (iss,aud,iat,exp,expiry):', decoded.payload && {
    iss: decoded.payload.iss,
    aud: decoded.payload.aud,
    iat: decoded.payload.iat,
    exp: decoded.payload.exp,
    expiry: decoded.payload.expiry
  });

  return merithubJwt;
}

function generateClassJwt() {
  assertEnv();
  const iat = Math.floor(nowMs() / 1000);

  // JWT for class API - might need different audience
  const payload = {
    iss: CLIENT_ID,
    aud: `https://class1.meritgraph.com/v1/${CLIENT_ID}`, // Class API audience
    iat,
    exp: iat + 3600,
    expiry: 3600
  };

  console.log('🔑 Generating Class JWT with payload:', payload);
  // HS256
  const classJwt = jwt.sign(payload, CLIENT_SECRET, { algorithm: 'HS256' });

  // Debug (safe): only show header + a peek at payload
  const decoded = jwt.decode(classJwt, { complete: true }) || {};
  console.log('🔍 Class JWT header:', decoded.header);
  console.log('🔍 Class JWT payload (iss,aud,iat,exp,expiry):', decoded.payload && {
    iss: decoded.payload.iss,
    aud: decoded.payload.aud,
    iat: decoded.payload.iat,
    exp: decoded.payload.exp,
    expiry: decoded.payload.expiry
  });

  return classJwt;
}

// -------------------- Access Token Flow ----------------------

async function getAccessToken() {
  try {
    assertEnv();

    // Quick diagnostics to ensure we’re reading the new env at runtime
    console.log('🧪 Secret shape @runtime:', diagSecretShape());

    if (accessToken && tokenExpiry && nowMs() < tokenExpiry) {
      console.log('🔁 Using cached MeritHub access token.');
      return accessToken;
    }

    console.log('🔄 Generating new MeritHub access token...');
    const merithubJwt = generateJwt();

    // Send as form-encoded (per MeritHub requirements)
    const urlencoded = new URLSearchParams();
    urlencoded.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    urlencoded.append('assertion', 'Bearer ' + merithubJwt); // REQUIRED "Bearer "

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    console.log('🛰️ Token request body (form-encoded):', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: 'Bearer ***JWT_REDACTED***'
    });

    const response = await axios.post(
      `${BASE_URL}/${CLIENT_ID}/api/token`,
      urlencoded.toString(),
      { headers, timeout: 15000 }
    );

    const { access_token, expires_in } = response.data || {};
    if (!access_token) {
      throw new Error(`Token response missing access_token: ${JSON.stringify(response.data)}`);
    }

    accessToken = access_token;
    // Refresh ~60s early
    const ttlMs = Math.max(10, (Number(expires_in) || 3600) * 1000 - 60000);
    tokenExpiry = nowMs() + ttlMs;

    console.log('✅ MeritHub access token retrieved successfully (expires_in ~', expires_in, 's )');
    return accessToken;
  } catch (error) {
    console.error('❌ Error while fetching MeritHub access token:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
      console.error('Request URL:', error.config?.url);
    }

    if (error.response?.status === 401) {
      throw new Error('MeritHub authentication failed (401). Verify CLIENT_ID/SECRET, JWT `aud`, and the Bearer assertion. Also ensure your secret is the *plain* value.');
    } else if (error.response?.status === 400) {
      throw new Error('Invalid token request (400). Check JWT payload/encoding and assertion format.');
    } else {
      throw new Error(`Failed to retrieve MeritHub access token: ${error.message}`);
    }
  }
}

// --------------------------- Users ---------------------------

async function addUser(userDetails) {
  try {
    if (!userDetails || !userDetails.clientUserId) {
      throw new Error('addUser requires userDetails with unique clientUserId');
    }

    console.log('🔄 Adding user to MeritHub:', userDetails.clientUserId);

    const token = await getAccessToken();
    const response = await axios.post(
      `${BASE_URL}/${CLIENT_ID}/users`,
      userDetails,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('✅ User added to MeritHub successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Error adding user to MeritHub:', error.message);
    if (error.response) {
      console.error('MeritHub API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
    }
    throw error;
  }
}

async function updateUser(userId, userDetails) {
  try {
    if (!userId) throw new Error('updateUser requires userId');

    const token = await getAccessToken();
    const response = await axios.put(
      `${BASE_URL}/${CLIENT_ID}/users/${encodeURIComponent(userId)}`,
      userDetails,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('✅ User updated successfully:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
      throw new Error(
        `Failed to update user. API responded with status ${error.response.status}: ${error.response.data.message || JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      throw new Error('Failed to update user. No response from the server.');
    } else {
      console.error('Unexpected error:', error.message);
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }
}

async function deleteUser(userId) {
  try {
    if (!userId) throw new Error('deleteUser requires userId');

    const token = await getAccessToken();
    const response = await axios.delete(
      `${BASE_URL}/${CLIENT_ID}/users/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('✅ User deleted successfully:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
      throw new Error(
        `Failed to delete user. API responded with status ${error.response.status}: ${error.response.data.message || JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      throw new Error('Failed to delete user. No response from the server.');
    } else {
      console.error('Unexpected error:', error.message);
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }
}

// --------------------------- Classes -------------------------

async function scheduleLiveClass(instructorUserId, classDetails, userToken = null) {
  try {
    if (!instructorUserId) throw new Error('scheduleLiveClass requires instructorUserId');

    console.log(`🎥 [SCHEDULE] Creating live class for instructor: ${instructorUserId}`);
    console.log(`🎥 [SCHEDULE] Endpoint: ${CLASS_BASE_URL}/${CLIENT_ID}/${encodeURIComponent(instructorUserId)}`);
    
    // Use Access Token for class scheduling (as per MeritHub documentation)
    const accessToken = await getAccessToken();
    console.log(`🎫 [SCHEDULE] Using Access Token for authentication`);
    console.log(`📤 [SCHEDULE] Sending class details to Merithub:`, JSON.stringify(classDetails, null, 2));
    console.log(`🔍 [SCHEDULE] Access field value:`, classDetails.access);
    console.log(`🔍 [SCHEDULE] Access field type:`, typeof classDetails.access);
    
    const response = await axios.post(
      `${CLASS_BASE_URL}/${CLIENT_ID}/${encodeURIComponent(instructorUserId)}`,
      classDetails,
      {
        headers: {
          Authorization: accessToken, // Access token already includes "Bearer "
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    console.log('✅ Live class scheduled successfully!');
    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', response.headers);
    console.log('📊 Response data:', response.data);
    
    // Handle empty response (some APIs return 200 with empty body on success)
    if (!response.data || Object.keys(response.data).length === 0) {
      console.log('❌ Empty response received from MeritHub - class creation failed');
      console.log('   MeritHub did not return proper class links');
      console.log('   This indicates the class was not properly created in MeritHub');
      
      // Don't create mock response - throw error instead
      throw new Error('MeritHub API returned empty response. Class was not created properly. Please check MeritHub configuration or try again later.');
    }
    
    // Validate response structure based on actual MeritHub response format
    if (!response.data.classId || !response.data.commonLinks) {
      console.log('❌ Invalid response structure from MeritHub');
      console.log('   Expected: classId and commonLinks');
      console.log('   Received:', response.data);
      throw new Error('MeritHub API returned invalid response structure. Missing classId or commonLinks.');
    }
    
    console.log('✅ Valid MeritHub response received:');
    console.log('   Class ID:', response.data.classId);
    console.log('   Common Links:', Object.keys(response.data.commonLinks));
    console.log('   Host Link:', response.data.hostLink ? 'Present' : 'Not provided');
    
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
      throw new Error(
        `Failed to schedule live class. API responded with status ${error.response.status}: ${error.response.data.message || JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      throw new Error('Failed to schedule live class. No response from the server.');
    } else {
      console.error('Unexpected error:', error.message);
      throw new Error(`Failed to schedule live class: ${error.message}`);
    }
  }
}

async function addUsersToClass(classId, userIds, commonParticipantLink = null) {
  try {
    if (!classId) throw new Error('addUsersToClass requires classId');
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error('addUsersToClass requires a non-empty userIds array');
    }

    console.log(`👥 [ADD_USERS] Adding ${userIds.length} users to class: ${classId}`);
    console.log(`🔗 [ADD_USERS] Raw common participant link provided: ${commonParticipantLink ? 'YES' : 'NO'}`);
    if (commonParticipantLink) {
      console.log(`🔗 [ADD_USERS] Raw common participant link: ${commonParticipantLink}`);
      console.log(`🔗 [ADD_USERS] Link type: ${commonParticipantLink.includes('http') ? 'FORMATTED URL (WRONG)' : 'RAW LINK (CORRECT)'}`);
    }
    
    // Use AccessToken for adding users to class (as per MeritHub API documentation)
    const token = await getAccessToken();
    
    // MeritHub API will generate individual user links for each user
    // 🔧 FIX: According to Merithub docs, each user should have userLink = commonParticipantLink
    let users = userIds.map(userId => ({
      userId,
      userType: 'su' // Service User type as per API documentation
    }));

    console.log(`👥 [ADD_USERS] Initial users to add:`, users);
    console.log(`👥 [ADD_USERS] Using AccessToken for user management API`);
    
    if (commonParticipantLink) {
      console.log(`🔧 [FIX] Adding commonParticipantLink as userLink for each user`);
      console.log(`🔗 [ADD_USERS] Using commonParticipantLink as userLink: ${commonParticipantLink}`);
      
      // Add userLink to each user object
      users = users.map(user => ({
        ...user,
        userLink: commonParticipantLink
      }));
      
      console.log(`✅ [ADD_USERS] Updated users with userLink:`, users);
    } else {
      console.log(`⚠️ [ADD_USERS] No commonParticipantLink provided - users will not have userLink`);
    }
    
    const requestBody = { users };
    
    const requestUrl = `${CLASS_BASE_URL}/${CLIENT_ID}/${encodeURIComponent(classId)}/users`;
    
    console.log(`📤 [ADD_USERS] Full request details:`);
    console.log(`   URL: ${requestUrl}`);
    console.log(`   Method: POST`);
    console.log(`   Headers: Authorization: ${token.substring(0, 20)}..., Content-Type: application/json`);
    console.log(`   Body: ${JSON.stringify(requestBody, null, 2)}`);
    console.log(`   Expected Response: Array of {userId, userLink} objects`);

    const response = await axios.post(
      requestUrl,
      requestBody,
      {
        headers: {
          Authorization: token, // Access token already includes "Bearer "
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    console.log('✅ Users added to class successfully!');
    console.log(`📥 [ADD_USERS] Response details:`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Response Type: ${typeof response.data}`);
    console.log(`   Is Array: ${Array.isArray(response.data)}`);
    console.log(`   Length: ${response.data ? response.data.length : 'N/A'}`);
    console.log(`   Full Response: ${JSON.stringify(response.data, null, 2)}`);
    
    if (Array.isArray(response.data)) {
      response.data.forEach((userResponse, index) => {
        console.log(`   User ${index + 1}:`);
        console.log(`     userId: ${userResponse.userId}`);
        console.log(`     userLink: ${userResponse.userLink || 'MISSING'}`);
        console.log(`     Other fields: ${Object.keys(userResponse).filter(k => k !== 'userId' && k !== 'userLink').join(', ')}`);
      });
    }
    
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
      throw new Error(
        `Failed to add users to class. API responded with status ${error.response.status}: ${error.response.data.message || JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      throw new Error('Failed to add users to class. No response from the server.');
    } else {
      console.error('Unexpected error:', error.message);
      throw new Error(`Failed to add users to class: ${error.message}`);
    }
  }
}

async function getClassStatus(classId) {
  try {
    if (!classId) throw new Error('getClassStatus requires classId');

    console.log(`📊 [STATUS] Getting class status for: ${classId}`);
    
    // Use Access Token for class status API
    const accessToken = await getAccessToken();
    
    const response = await axios.get(
      `${CLASS_BASE_URL}/${CLIENT_ID}/${encodeURIComponent(classId)}/status`,
      {
        headers: {
          Authorization: accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('✅ Class status retrieved successfully:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
      throw new Error(
        `Failed to get class status. API responded with status ${error.response.status}: ${error.response.data.message || JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      throw new Error('Failed to get class status. No response from the server.');
    } else {
      console.error('Unexpected error:', error.message);
      throw new Error(`Failed to get class status: ${error.message}`);
    }
  }
}

async function removeUsersFromClass(classId, userIds) {
  try {
    if (!classId) throw new Error('removeUsersFromClass requires classId');
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error('removeUsersFromClass requires a non-empty userIds array');
    }

    console.log(`👥 [REMOVE_USERS] Removing ${userIds.length} users from class: ${classId}`);
    
    // Use AccessToken for user management operations
    const token = await getAccessToken();

    const response = await axios.post(
      `${CLASS_BASE_URL}/${CLIENT_ID}/${encodeURIComponent(classId)}/removeuser`,
      { users: userIds },
      {
        headers: {
          Authorization: `Bearer ${token}`, // Use AccessToken for user management
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    console.log('✅ Users removed from class successfully:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
      throw new Error(
        `Failed to remove users from class. API responded with status ${error.response.status}: ${error.response.data.message || JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      throw new Error('Failed to remove users from class. No response from the server.');
    } else {
      console.error('Unexpected error:', error.message);
      throw new Error(`Failed to remove users from class: ${error.message}`);
    }
  }
}

async function editClass(classId, classDetails) {
  try {
    if (!classId) throw new Error('editClass requires classId');

    console.log(`✏️ [EDIT_CLASS] Editing class: ${classId}`);
    
    // Use AccessToken for class management operations
    const token = await getAccessToken();
    const response = await axios.put(
      `${CLASS_BASE_URL}/${CLIENT_ID}/${encodeURIComponent(classId)}`,
      classDetails,
      {
        headers: {
          Authorization: `Bearer ${token}`, // Use AccessToken for class management
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    console.log('✅ Live class edited successfully:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
      throw new Error(
        `Failed to edit live class. API responded with status ${error.response.status}: ${error.response.data.message || JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      throw new Error('Failed to edit live class. No response from the server.');
    } else {
      console.error('Unexpected error:', error.message);
      throw new Error(`Failed to edit live class: ${error.message}`);
    }
  }
}

async function deleteLiveClass(classId) {
  try {
    if (!classId) throw new Error('deleteLiveClass requires classId');

    console.log(`🗑️ [DELETE_CLASS] Deleting class: ${classId}`);
    
    // Use AccessToken for class management operations
    const token = await getAccessToken();
    const response = await axios.delete(
      `${CLASS_BASE_URL}/${CLIENT_ID}/${encodeURIComponent(classId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`, // Use AccessToken for class management
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      }
    );

    console.log('✅ Live class deleted successfully:', response.data);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.data);
      console.error('Status Code:', error.response.status);
      throw new Error(
        `Failed to delete live class. API responded with status ${error.response.status}: ${error.response.data.message || JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      console.error('No response received from API:', error.request);
      throw new Error('Failed to delete live class. No response from the server.');
    } else {
      console.error('Unexpected error:', error.message);
      throw new Error(`Failed to delete live class: ${error.message}`);
    }
  }
}

// -------------------------- Exports --------------------------

module.exports = {
  generateJwt,
  getAccessToken,
  addUser,
  updateUser,
  deleteUser,
  scheduleLiveClass,
  addUsersToClass,
  getClassStatus,
  removeUsersFromClass,
  editClass,
  deleteLiveClass
};
