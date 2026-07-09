// client-side account profile view - profilee.js




async function fetchUserData() {
    return await fetch('/profile/api/user/Testing_Account').then( raw => raw.json()).then( data => {return data})
}


