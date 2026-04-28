const dot  = document.getElementById("status-dot");
const text = document.getElementById("status-text");
const btn  = document.getElementById("check-btn");

function checkStatus() {
  dot.className = "status-dot";
  text.innerHTML = "Checking…";
  chrome.runtime.sendMessage({ type: "CHECK_BUNPRO_LOGIN" }, (r) => {
    if (r?.data?.loggedIn) {
      dot.className = "status-dot ok";
      text.innerHTML = "<strong>Connected</strong> — logged in to Bunpro ✓";
    } else {
      dot.className = "status-dot err";
      text.innerHTML = "<strong>Not logged in</strong> — open Bunpro and sign in, then click Check again";
    }
  });
}

btn.addEventListener("click", checkStatus);
checkStatus();
