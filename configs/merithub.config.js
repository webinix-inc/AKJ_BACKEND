const axios = require('axios');
const jwt = require('jsonwebtoken');
const { accessTokenTime } = require('./auth.config');

const CLIENT_ID = process.env.MERIT_HUB_CLIENT_ID;
const CLIENT_SECRET = process.env.MERIT_HUB_SECRET_KEY;
const BASE_URL = 'https://serviceaccount1.meritgraph.com/v1';

let accessToken = null;
let tokenExpiry = null;

/**
 * Generate a JWT token
 */
function generateJwt() {
    const payload = {
        iss: CLIENT_ID,
        aud: `${BASE_URL}/${CLIENT_ID}/api/token`,
        expiry: 3600,
    };

    return jwt.sign(payload, CLIENT_SECRET);
}

/**
 * Retrieve Access Token
 */
async function getAccessToken() {
    try {   
        // Check for cached token validity
        if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
            console.log('Using cached access token.');
            return accessToken;
        }

        // Generate JWT token
        const merithubJwt = generateJwt(); // Ensure generateJwt function returns a valid JWT

        // Prepare request body as x-www-form-urlencoded
        const urlencoded = new URLSearchParams();
        urlencoded.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        urlencoded.append('assertion', merithubJwt);

        // Set headers
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
        };

        // Make the request to get the access token
        const response = await axios.post(
            `https://serviceaccount1.meritgraph.com/v1/${CLIENT_ID}/api/token`,
            urlencoded.toString(),
            { headers }
        );

        // Cache the token and expiry
        accessToken = response.data.access_token;
        tokenExpiry = Date.now() + response.data.expires_in * 1000;

        return accessToken;
    } catch (error) {
        // Handle and log errors
        console.error('Error while fetching access token:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
            console.error('Response Status:', error.response.status);
        }
        throw new Error('Failed to retrieve access token. Please check your credentials and network.');
    }
}

async function addUser(userDetails) {
    const token = await getAccessToken();
    const response = await axios.post(
        `${BASE_URL}/${CLIENT_ID}/users`,
        userDetails,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        }
    );

    return response.data;
}

async function updateUser(userId, userDetails) {
    try {
        const token = await getAccessToken(); // Retrieve the access token

        // Make the API request to update the user
        const response = await axios.put(
            `${BASE_URL}/${CLIENT_ID}/users/${userId}`,
            userDetails,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('User updated successfully:', response.data);
        return response.data;
    } catch (error) {
        // Log and handle different types of errors
        if (error.response) {
            // The request was made, and the server responded with a non-2xx status
            console.error('API Error:', error.response.data);
            console.error('Status Code:', error.response.status);

            throw new Error(
                `Failed to update user. API responded with status ${error.response.status}: ${error.response.data.message || error.response.data}`
            );
        } else if (error.request) {
            // The request was made, but no response was received
            console.error('No response received from API:', error.request);

            throw new Error('Failed to update user. No response from the server.');
        } else {
            // Something else caused the error
            console.error('Unexpected error:', error.message);

            throw new Error(`Failed to update user: ${error.message}`);
        }
    }
}

/**
 * Schedule a Live Class
 */
async function scheduleLiveClass(userId, classDetails) {
    try {
        const token = await getAccessToken(); // Retrieve the access token

        // Make the API request to schedule the live class
        const response = await axios.post(
            `https://class1.meritgraph.com/v1/${CLIENT_ID}/${userId}`,
            classDetails,
            {
                headers: {
                    Authorization: `${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('Live class scheduled successfully:', response.data);
        return response.data;
    } catch (error) {
        // Log and handle different types of errors
        if (error.response) {
            // The request was made, and the server responded with a non-2xx status
            console.error('API Error:', error.response.data);
            console.error('Status Code:', error.response.status);

            throw new Error(
                `Failed to schedule live class. API responded with status ${error.response.status}: ${error.response.data.message || error.response.data}`
            );
        } else if (error.request) {
            // The request was made, but no response was received
            console.error('No response received from API:', error.request);

            throw new Error('Failed to schedule live class. No response from the server.');
        } else {
            // Something else caused the error
            console.error('Unexpected error:', error.message);

            throw new Error(`Failed to schedule live class: ${error.message}`);
        }
    }
}

/**
 * Add Users to a Live Class
 */
async function addUsersToClass(classId, userIds, commonParticipantLink) {
    try {
        const token = await getAccessToken(); // Retrieve the access token

        // Prepare the request body with commonParticipantLink
        const users = userIds.map(userId => ({
            userId,
            userLink: commonParticipantLink, // Use the commonParticipantLink for all users
            userType: 'su', // Assuming 'su' stands for "Student" or similar. Adjust if needed.
        }));

        const requestBody = { users };
        console.log(requestBody)

        // Make the API request to add users to the class
        const response = await axios.post(
            ` https://class1.meritgraph.com/v1/${CLIENT_ID}/${classId}/users`,
            requestBody,
            {
                headers: {
                    Authorization: `${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('Users added to class successfully:', response.data);
        return response.data;
    } catch (error) {
        // Log and handle different types of errors
        if (error.response) {
            // The request was made, and the server responded with a non-2xx status
            console.error('API Error:', error.response.data);
            console.error('Status Code:', error.response.status);

            throw new Error(
                `Failed to add users to class. API responded with status ${error.response.status}: ${error.response.data.message || error.response.data}`
            );
        } else if (error.request) {
            // The request was made, but no response was received
            console.error('No response received from API:', error.request);

            throw new Error('Failed to add users to class. No response from the server.');
        } else {
            // Something else caused the error
            console.error('Unexpected error:', error.message);

            throw new Error(`Failed to add users to class: ${error.message}`);
        }
    }
}

/**
 * Edit an existing Live Class
 * @param {string} classId - The ID of the class to be edited
 * @param {Object} classDetails - The details to update the class with
 */
async function editClass(classId, classDetails) {
    try {
        const token = await getAccessToken(); // Retrieve the access token
        // Make the API request to edit the live class
        const response = await axios.put(
            `https://class1.meritgraph.com/v1/${CLIENT_ID}/${classId}`,
            classDetails,
            {
                headers: {
                    Authorization: `${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('Live class edited successfully:', response.data);
        return response.data;
    } catch (error) {
        // Log and handle different types of errors
        if (error.response) {
            // The request was made, and the server responded with a non-2xx status
            console.error('API Error:', error.response.data);
            console.error('Status Code:', error.response.status);

            throw new Error(
                `Failed to edit live class. API responded with status ${error.response.status}: ${error.response.data.message || error.response.data}`
            );
        } else if (error.request) {
            // The request was made, but no response was received
            console.error('No response received from API:', error.request);

            throw new Error('Failed to edit live class. No response from the server.');
        } else {
            // Something else caused the error
            console.error('Unexpected error:', error.message);

            throw new Error(`Failed to edit live class: ${error.message}`);
        }
    }
}

async function deleteLiveClass(classId) {
    try {
        const token = await getAccessToken(); // Retrieve the access token

        // Make the API request to delete the live class
        const response = await axios.delete(
            `https://class1.meritgraph.com/v1/${CLIENT_ID}/${classId}`,
            {
                headers: {
                    Authorization: `${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('Live class deleted successfully:', response.data);
        return response.data;
    } catch (error) {
        // Log and handle different types of errors
        if (error.response) {
            // The request was made, and the server responded with a non-2xx status
            console.error('API Error:', error.response.data);
            console.error('Status Code:', error.response.status);

            throw new Error(
                `Failed to delete live class. API responded with status ${error.response.status}: ${error.response.data.message || error.response.data}`
            );
        } else if (error.request) {
            // The request was made, but no response was received
            console.error('No response received from API:', error.request);

            throw new Error('Failed to delete live class. No response from the server.');
        } else {
            // Something else caused the error
            console.error('Unexpected error:', error.message);

            throw new Error(`Failed to delete live class: ${error.message}`);
        }
    }
}

module.exports = { scheduleLiveClass,addUser,updateUser,addUsersToClass,editClass,deleteLiveClass };
