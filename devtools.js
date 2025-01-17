// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

chrome.devtools.panels.create(
  "Journey Debugger",
  "images/bug-16.png",
  "debugger.html",
  (panel) => {
    panel.onSearch.addListener((action, queryString) => {
      //handleSearch(action, query, panel);
      // panel.setSearchResultsCount(16);
      chrome.runtime.sendMessage({
        type: "search",
        payload: { action, queryString },
      });
    });
  }
);
