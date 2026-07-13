import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";

type TrackerUiState = {
  filterStatus: string;
  searchQuery: string;
  statsOpen: boolean;
  expandedJob: number | null;
};

const initialTrackerState: TrackerUiState = {
  filterStatus: "All",
  searchQuery: "",
  statsOpen: true,
  expandedJob: null,
};

const trackerUiSlice = createSlice({
  name: "trackerUi",
  initialState: initialTrackerState,
  reducers: {
    setFilterStatus: (state, action: PayloadAction<string>) => { state.filterStatus = action.payload; },
    setSearchQuery: (state, action: PayloadAction<string>) => { state.searchQuery = action.payload; },
    setStatsOpen: (state, action: PayloadAction<boolean>) => { state.statsOpen = action.payload; },
    setExpandedJob: (state, action: PayloadAction<number | null>) => { state.expandedJob = action.payload; },
  },
});

export const { setFilterStatus, setSearchQuery, setStatsOpen, setExpandedJob } = trackerUiSlice.actions;

export const store = configureStore({ reducer: { trackerUi: trackerUiSlice.reducer } });
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

