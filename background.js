var mru = [];
var slowSwitchOngoing = false;
var fastSwitchOngoing = false;
var intSwitchCount = 0;
var lastIntSwitchTabId = null;
var switchGeneration = 0;

var slowtimerValue = 1500;
var fasttimerValue = 200;
var timer;

var slowswitchForward = false;

var initialized = false;

var loggingOn = true;

var logTabInfo = function() {
  chrome.tabs.query({active: true, lastFocusedWindow: true}, function(tabs){
    if (!tabs.length) {
      return;
    }
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
    lastIntSwitchTabId = null;
    doIntSwitch();

  } else if ((slowSwitchOngoing && !fastswitch) || (fastSwitchOngoing && fastswitch)) {
    CLUTlog("CLUT::DO_INT_SWITCH");
    doIntSwitch();

  } else if (slowSwitchOngoing && fastswitch) {
    endSwitch();
    fastSwitchOngoing = true;
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    lastIntSwitchTabId = null;
    doIntSwitch();

  } else if (fastSwitchOngoing && !fastswitch) {
    endSwitch();
    slowSwitchOngoing = true;
    CLUTlog("CLUT::START_SWITCH");
    intSwitchCount = 0;
    lastIntSwitchTabId = null;
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
    var thisWindowId;
    var nextSwitchCount;
    if (slowswitchForward) {
      decrementSwitchCounter();
      nextSwitchCount = intSwitchCount;
    } else {
      incrementSwitchCounter();
      nextSwitchCount = intSwitchCount;
    }
    tabIdToMakeActive = mru[nextSwitchCount];
    var currentSwitchGeneration = ++switchGeneration;
    chrome.tabs.get(tabIdToMakeActive, function(tab) {
      if (chrome.runtime.lastError) {
        removeMissingTabAtSwitchIndex(nextSwitchCount);
        return;
      }
      if (currentSwitchGeneration != switchGeneration) {
        return;
      }

      if (tab) {
        thisWindowId = tab.windowId;
        lastIntSwitchTabId = tabIdToMakeActive;

        chrome.windows.update(thisWindowId, {
          "focused": true
        });
        chrome.tabs.update(tabIdToMakeActive, {
          active: true,
          highlighted: true
        });
        //break;
      } else {
        CLUTlog("CLUT:: in int switch, >>invalid tab found.intSwitchCount: " + intSwitchCount + ", mru.length: " + mru.length);
        removeMissingTabAtSwitchIndex(nextSwitchCount);
      }
    });
  }
}

var endSwitch = function() {
  CLUTlog("CLUT::END_SWITCH");
  slowSwitchOngoing = false;
  fastSwitchOngoing = false;
  ++switchGeneration;
  if (lastIntSwitchTabId) {
    putExistingTabToTop(lastIntSwitchTabId);
  }
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
    mru.push(tabId);
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
  if (!tabId) {
    return;
  }
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

var removeMissingTabAtSwitchIndex = function(index) {
  removeItemAtIndexFromMRU(index);
  // Keep the counter before the removed slot because doIntSwitch advances first.
  if (index >= mru.length) {
    intSwitchCount = mru.length > 0 ? mru.length - 1 : 0;
  } else {
    intSwitchCount = index > 0 ? index - 1 : mru.length - 1;
  }
  doIntSwitch();
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

initialize();

var quickSwitchActiveUsage = function() {}

var slowSwitchActiveUsage = function() {}
