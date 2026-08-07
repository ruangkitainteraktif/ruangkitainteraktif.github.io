  // Sub-tab Detail
  function openDetailSubTab(evt, subtabId) {
    activateDetailSubTab(subtabId);
    evt.currentTarget.classList.add("active");
  }

  function activateDetailSubTab(subtabId) {
    const contents = document.getElementsByClassName("detail-subtab-content");
    for (let i = 0; i < contents.length; i++) contents[i].style.display = "none";

    const btns = document.getElementsByClassName("detail-tab-btn");
    for (let i = 0; i < btns.length; i++) btns[i].classList.remove("active");

    document.getElementById(subtabId).style.display = "block";
    const targetBtn = [...btns].find(btn => btn.getAttribute('onclick')?.includes(subtabId));
    if (targetBtn) targetBtn.classList.add("active");
  }
