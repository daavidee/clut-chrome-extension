var mru = [];
var slowSwitchOngoing = false;
var fastSwitchOngoing = false;
var intSwitchCount = 0;
var lastIntSwitchIndex = 0;
var altPressed = false;
var wPressed = false;

var domLoaded = false
var quickActive = 0;
var slowActive = 0;

var prevTimestamp = 0;
var slowtimerValue = 1500;
var fasttimerValue = 200;
var timer;

var slowswitchForward = false;

var initialized = false;

var loggingOn = true;

var logTabInfo = function() {
  chrome.tabs.query({active: true, lastFocusedWindow: true}, function(tabs){
    var id = tabs[0].id;
    var url = tabs[0].url;
    CLUTlog(`Tab with ID: ${id} has url: ${url}`);
  });
}

var CLUTlog = function(str) {
  if (loggingOn) {
    console.log(str);
  }
}

function getVersion() {
  var manifestData = chrome.runtime.getManifest();
  return manifestData.version;
}

var processCommand = function(command) {
  CLUTlog('Command recd:' + command);
  var fastswitch = true;
  slowswitchForward = false;
  if (command == "alt_switch_fast") {
    fastswitch = true;
    quickSwitchActiveUsage();
  } else if (command == "alt_switch_slow_backward") {
    fastswitch = false;
    slowswitchForward = false;
    slowSwitchActiveUsage();
  } else if (command == "alt_switch_slow_forward") {
    fastswitch = false;
    slowswitchForward = true;
    slowSwitchActiveUsage();
  }

  if (!slowSwitchOngoing && !fastSwitchOngoing) {
    if (fastswitch) {
      fastSwitchOngoing = true;
    } else {
      slowSwitchOngoing = true;
    }
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();

  } else if ((slowSwitchOngoing && !fastswitch) || (fastSwitchOngoing && fastswitch)) {
    CLUTlog("CLUT::DO_INT_SWITCH");
    doIntSwitch();

  } else if (slowSwitchOngoing && fastswitch) {
    endSwitch();
    fastSwitchOngoing = true;
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();

  } else if (fastSwitchOngoing && !fastswitch) {
    endSwitch();
    slowSwitchOngoing = true;
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    doIntSwitch();
  }

  if (timer) {
    if (fastSwitchOngoing || slowSwitchOngoing) {
      clearTimeout(timer);
    }
  }
  if (fastswitch) {
    timer = setTimeout(function() {
      endSwitch()
    }, fasttimerValue);
  } else {
    timer = setTimeout(function() {
      endSwitch()
    }, slowtimerValue);
  }

};

chrome.commands.onCommand.addListener(processCommand);

chrome.action.onClicked.addListener(function(tab) {
  CLUTlog('Click recd');
  processCommand('alt_switch_fast');

});

chrome.runtime.onStartup.addListener(function() {
  CLUTlog("on startup");
  initialize();

});

chrome.runtime.onInstalled.addListener(function() {
  CLUTlog("on startup");
  initialize();

});


var doIntSwitch = function() {
  CLUTlog("CLUT:: in int switch, intSwitchCount: " + intSwitchCount + ", mru.length: " + mru.length);
  if (intSwitchCount < mru.length && intSwitchCount >= 0) {
    var tabIdToMakeActive;
    //check if tab is still present
    //sometimes tabs have gone missing
    var invalidTab = true;
    var thisWindowId;
    if (slowswitchForward) {
      decrementSwitchCounter();
    } else {
      incrementSwitchCounter();
    }
    tabIdToMakeActive = mru[intSwitchCount];
    chrome.tabs.get(tabIdToMakeActive, function(tab) {
      if (tab) {
        thisWindowId = tab.windowId;
        invalidTab = false;

        chrome.windows.update(thisWindowId, {
          "focused": true
        });
        chrome.tabs.update(tabIdToMakeActive, {
          active: true,
          highlighted: true
        });
        lastIntSwitchIndex = intSwitchCount;
        //break;
      } else {
        CLUTlog("CLUT:: in int switch, >>invalid tab found.intSwitchCount: " + intSwitchCount + ", mru.length: " + mru.length);
        removeItemAtIndexFromMRU(intSwitchCount);
        if (intSwitchCount >= mru.length) {
          intSwitchCount = 0;
        }
        doIntSwitch();
      }
    });
  }
}

var endSwitch = function() {
  CLUTlog("CLUT::END_SWITCH");
  slowSwitchOngoing = false;
  fastSwitchOngoing = false;
  var tabId = mru[lastIntSwitchIndex];
  putExistingTabToTop(tabId);
  printMRUSimple();
}

chrome.tabs.onActivated.addListener(function(activeInfo) {
  if (!slowSwitchOngoing && !fastSwitchOngoing) {
    var index = mru.indexOf(activeInfo.tabId);

    //probably should not happen since tab created gets called first than activated for new tabs,
    // but added as a backup behavior to avoid orphan tabs
    if (index == -1) {
      CLUTlog("Unexpected scenario hit with tab(" + activeInfo.tabId + ").")
      addTabToMRUAtFront(activeInfo.tabId)
    } else {
      putExistingTabToTop(activeInfo.tabId);
    }
  }
});

chrome.tabs.onCreated.addListener(function(tab) {
  CLUTlog("Tab create event fired with tab(" + tab.id + ")");
  addTabToMRUAtBack(tab.id);
  logTabInfo();
});

chrome.tabs.onRemoved.addListener(function(tabId, removedInfo) {
  CLUTlog("Tab remove event fired from tab(" + tabId + ")");
  removeTabFromMRU(tabId);
});


var addTabToMRUAtBack = function(tabId) {
  var index = mru.indexOf(tabId);
  if (index == -1) {
    //add to the end of mru
    mru.splice(-1, 0, tabId);
    CLUTlog("Tab added to MRU at back: " + tabId);
  }

}

var addTabToMRUAtFront = function(tabId) {
  var index = mru.indexOf(tabId);
  if (index == -1) {
    //add to the front of mru
    mru.splice(0, 0, tabId);
    CLUTlog("Tab added to MRU at front: " + tabId);
  }
}

var putExistingTabToTop = function(tabId) {
  var index = mru.indexOf(tabId);
  if (index != -1) {
    mru.splice(index, 1);
    mru.unshift(tabId);
    CLUTlog("Tab moved to top of MRU: " + tabId);
    logTabInfo();
  }
}

var removeTabFromMRU = function(tabId) {
  var index = mru.indexOf(tabId);
  if (index != -1) {
    mru.splice(index, 1);
    CLUTlog("Tab removed from MRU: " + tabId);
  }
}

var removeItemAtIndexFromMRU = function(index) {
  if (index < mru.length) {
    mru.splice(index, 1);
    CLUTlog("Tab removed from MRU at index: " + index);
  }
}

var incrementSwitchCounter = function() {
  intSwitchCount = (intSwitchCount + 1) % mru.length;
}

var decrementSwitchCounter = function() {
  if (intSwitchCount == 0) {
    intSwitchCount = mru.length - 1;
  } else {
    intSwitchCount = intSwitchCount - 1;
  }
}

var initialize = function() {
  if (!initialized) {
    initialized = true;
    chrome.windows.getAll({
      populate: true
    }, function(windows) {
      windows.forEach(function(window) {
        window.tabs.forEach(function(tab) {
          mru.unshift(tab.id);
          CLUTlog("Tab added to MRU during init: " + tab.id);
        });
      });
      CLUTlog("MRU after init: " + mru);
    });
  }
}

var printTabInfo = function(tabId) {
  var info = "";
  chrome.tabs.get(tabId, function(tab) {
    info = "Tabid: " + tabId + " title: " + tab.title;
  });
  return info;
}

var str = "MRU status: \n";
var printMRU = function() {
  str = "MRU status: \n";
  for (var i = 0; i < mru.length; i++) {
    chrome.tabs.get(mru[i], function(tab) {});
  }
  CLUTlog(str);
}

var printMRUSimple = function() {
  CLUTlog("mru: " + mru);
}

var generatePrintMRUString = function() {
  chrome.tabs.query(function() {

  });
  str += (i + " :(" + tab.id + ")" + tab.title);
  str += "\n";
}

initialize();

var quickSwitchActiveUsage = function() {
  if (domLoaded) {
    if (quickActive == -1) {
      return;
    } else if (quickActive < 5) {
      quickActive++;
    } else if (quickActive >= 5) {
      quickActive = -1;
    }
  }
}

var slowSwitchActiveUsage = function() {
  if (domLoaded) {
    if (slowActive == -1) {
      return;
    } else if (slowActive < 5) {
      slowActive++;
    } else if (slowActive >= 5) {
      slowActive = -1;
    }
  }
}
