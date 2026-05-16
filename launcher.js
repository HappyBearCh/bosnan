function launch() {
    let bar = document.getElementById("bar");
    let status = document.getElementById("status");

    let p = 0;

    let interval = setInterval(() => {
        p += 3;
        bar.style.width = p + "%";
        status.innerText = "Loading systems... " + p + "%";

        if (p >= 100) {
            clearInterval(interval);
            status.innerText = "Launching Bosnan...";

            setTimeout(() => {
                window.location.href = "BosnanGame.jar";
            }, 1000);
        }
    }, 50);
}