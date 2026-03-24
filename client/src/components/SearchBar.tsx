import { observer } from 'mobx-react-lite';
import { Search } from 'lucide-react';
import { Input } from '@/components/shadcn/ui/input';
import type { SessionStore } from '../stores/SessionStore';

interface Props {
  store: SessionStore;
}

export const SearchBar = observer(({ store }: Props) => {
  return (
    <div className="px-4 py-3 border-b border-border space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
        <Input
          type="text"
          placeholder="search sessions..."
          value={store.searchQuery}
          onChange={(e) => store.setSearchQuery(e.target.value)}
          className="pl-8 h-8 text-sm bg-black/50"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={store.projectFilter}
          onChange={(e) => store.setProjectFilter(e.target.value)}
          className="flex-1 h-7 bg-black/50 border border-input text-sm text-zinc-300 px-2 rounded-none focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">all projects</option>
          {store.projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={store.sortBy}
          onChange={(e) => store.setSortBy(e.target.value as 'date' | 'messages' | 'project')}
          className="h-7 bg-black/50 border border-input text-sm text-zinc-300 px-2 rounded-none focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="date">sort by date</option>
          <option value="messages">sort by messages</option>
          <option value="project">sort by project</option>
        </select>
      </div>
    </div>
  );
});
