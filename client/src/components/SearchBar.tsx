import { observer } from 'mobx-react-lite';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const SearchBar = observer(({ store }: Props) => {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search sessions..."
        value={store.searchQuery}
        onChange={(e) => store.setSearchQuery(e.target.value)}
        className="search-input"
      />
      <div className="filters">
        <select
          value={store.projectFilter}
          onChange={(e) => store.setProjectFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All projects</option>
          {store.projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={store.sortBy}
          onChange={(e) => store.setSortBy(e.target.value as 'date' | 'messages' | 'project')}
          className="filter-select"
        >
          <option value="date">Sort by date</option>
          <option value="messages">Sort by messages</option>
          <option value="project">Sort by project</option>
        </select>
      </div>
    </div>
  );
});
