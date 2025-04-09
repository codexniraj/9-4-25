// aws-exports.js
const awsmobile = {
    Auth: {
      mandatorySignIn: true,
      region: "ap-south-1",            // e.g., "us-east-1"
      userPoolId: "ap-south-1_lCMCna2RL",            // e.g., "us-east-1_abcd1234"
      userPoolWebClientId: "7mdvqnncbbn2s8m668ip9jus5o", // e.g., "abcd1234efgh5678ijkl90mnop"
      authenticationFlowType: "USER_PASSWORD_AUTH"
    }
  };
  
  export default awsmobile;
  