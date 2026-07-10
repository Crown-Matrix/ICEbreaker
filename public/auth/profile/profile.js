// client-side account profile view - profilee.js

const username = localStorage.getItem('x-userdata-username');
const accountCreationDate = localStorage.getItem('x-userdata-accountcreationdate');
const system_status_element = document.getElementById('system-status');
system_status_element.setAttribute('pending', '');


if (username) {
    document.title = `Profile - ${username}`;
}

async function fetchUserData() {
    const res = await fetch(`/profile/api/user/${username}`)
    if (!res.ok) {
        if (res.status == 401 || res.status == 404) {
            localStorage.removeItem('x-userdata-username'); //prevents redirect loops
            localStorage.removeItem('x-userdata-accountcreationdate');
            window.location.href = '/login';
            return
        }
        console.error('Failed to fetch user data:', res.statusText);
        return null;
    }
    const userData = await res.json();
    console.log('Fetched user data:', userData);
    return userData;
}

async function updateProfileData() {
    const userProfileData = await fetchUserData();
    if (!userProfileData) {
        console.error('No user data available to update profile.');
        return;
    }
    document.dispatchEvent(new CustomEvent("profileDataUpdate", {
        detail: userProfileData

    }));
};



// Initial profile data update
updateProfileData();


const ACCOUNT_TIERS = { //so i can change it easily later if ever needed

    0: {
        name: "Novice",

        color: "#FFE600"
    },
    1: {
        name: "VIP",
        color: "#00FFFF"
    },
    2: {
        name: "Premium",
        color: "#9D00FF"
    },
    3: {
        name: "Admin",
        color: "var(--cy-magenta)"
    }
};



const fields = {

    username: {
        id: "username",
        type: "text"
    },

    sp_games_Played: {
        id: "sp_games_Played",
        type: "number"
    },

    mp_games_Played: {
        id: "mp_games_Played",
        type: "number"
    },

    mp_games_Won: {
        id: "mp_games_Won",
        type: "number"
    },

    sp_games_Finished: {
        id: "sp_games_Finished",
        type: "number"
    },

    mp_games_Finished: {
        id: "mp_games_Finished",
        type: "number"
    },

    sp_average_Score: {
        id: "sp_average_score",
        type: "score"
    },

    mp_average_Score: {
        id: "mp_average_score",
        type: "score"
    },

    account_Creation_Date: {
        id: "account_Creation_Date",
        type: "date"
    },

    last_Login_Date: {
        id: "last_Login_Date",
        type: "date"
    }

};



function formatNumber(value) {

    return Number(value || 0).toLocaleString();

}



function formatScore(value) {

    if (value === null || value === undefined)
        return "NO DATA";

    return formatNumber(value);

}



function formatDate(value, time = true) {

    if (!value)
        return "NO DATA";

    const config = {
        dateStyle: "long",
        ...(time && { timeStyle: "short" })
    };

    const date = new Date(value.replace(" ", "T") + "Z"); //the .replace just clarifys that server gives back utc

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const localeDate = d => d.toLocaleDateString(undefined, {
        dateStyle: "long"
    });

    let formatted = date.toLocaleString(undefined, config);

    if (localeDate(date) === localeDate(today))
        return formatted.replace(localeDate(today), "Today");

    if (localeDate(date) === localeDate(yesterday))
        return formatted.replace(localeDate(yesterday), "Yesterday");

    return formatted;
}



function updateProfile(data) {


    Object.keys(fields).forEach(key => {

        const config = fields[key];

        const element = document.getElementById(config.id);

        if (!element)
            return;


        switch (config.type) {

            case "score":

                element.textContent =
                    formatScore(data[key]);

                break;


            case "date":

                if (config.id === 'last_Login_Date') {
                    element.textContent = formatDate(data[key], true)
                } else { //like account creation date
                    element.textContent = formatDate(data[key], false);
                }
                break;


            case "number":

                element.textContent =
                    formatNumber(data[key]);

                break;


            default:

                element.textContent =
                    data[key] ?? "NO DATA";

        }

    });



    document.getElementById("eddies")
        .textContent =
        `₿ ${formatNumber(data.eddies)} EDDIES`;

    const tier =
        ACCOUNT_TIERS[data.account_tier] ??
        ACCOUNT_TIERS[0];


    const tierElement =
        document.getElementById("tier");


    tierElement.textContent =
        tier.name.toUpperCase();


    tierElement.style.color =
        tier.color;

    tierElement.style.borderColor =
        tier.color;



}



document.addEventListener(
    "profileDataUpdate",
    event => {


        const overlay =
            document.getElementById("syncOverlay");


        overlay.classList.add("sync-active");


        setTimeout(() => {

            updateProfile(event.detail);

            overlay.classList.remove("sync-active");

            system_status_element.removeAttribute('pending');
            system_status_element.textContent = "● CONNECTION VERIFIED";

        }, 350);



    });



