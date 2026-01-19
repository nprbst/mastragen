import { useState, useEffect } from 'react';

interface Skill {
  id: string;
  projectId: string;
  name: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface SkillsTabProps {
  projectId: string;
  orchestratorUrl: string;
}

export default function SkillsTab({ projectId, orchestratorUrl }: SkillsTabProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchSkills();
  }, [projectId]);

  async function fetchSkills() {
    try {
      const response = await fetch(`${orchestratorUrl}/projects/${projectId}/skills`);
      if (!response.ok) throw new Error('Failed to fetch skills');
      const data = await response.json();
      setSkills(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(skillId: string) {
    if (!confirm('Are you sure you want to delete this skill?')) return;

    try {
      const response = await fetch(`${orchestratorUrl}/projects/${projectId}/skills/${skillId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete skill');
      await fetchSkills();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete skill');
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        <div className="h-20 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Skills</h3>
          <p className="text-sm text-gray-500 mt-1">
            Domain knowledge files that provide context to Claude about your project patterns.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          + Add Skill
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500">
            &times;
          </button>
        </div>
      )}

      {(showAddForm || editingSkill) && (
        <SkillForm
          skill={editingSkill}
          projectId={projectId}
          orchestratorUrl={orchestratorUrl}
          onSave={() => {
            fetchSkills();
            setShowAddForm(false);
            setEditingSkill(null);
          }}
          onCancel={() => {
            setShowAddForm(false);
            setEditingSkill(null);
          }}
        />
      )}

      {skills.length === 0 && !showAddForm ? (
        <div className="text-center py-8 text-gray-500">
          <p>No skills configured yet.</p>
          <p className="text-sm mt-1">Skills help Claude understand your project's patterns and conventions.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {skills.map((skill) => (
            <div key={skill.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium text-gray-900">{skill.name}</h4>
                  <p className="text-sm text-gray-500 mt-1">{skill.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingSkill(skill)}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(skill.id)}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-3 bg-gray-50 rounded p-3 max-h-32 overflow-y-auto">
                <pre className="text-xs text-gray-600 whitespace-pre-wrap">{skill.content}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SkillFormProps {
  skill: Skill | null;
  projectId: string;
  orchestratorUrl: string;
  onSave: () => void;
  onCancel: () => void;
}

function SkillForm({ skill, projectId, orchestratorUrl, onSave, onCancel }: SkillFormProps) {
  const [name, setName] = useState(skill?.name || '');
  const [description, setDescription] = useState(skill?.description || '');
  const [content, setContent] = useState(skill?.content || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = skill
        ? `${orchestratorUrl}/projects/${projectId}/skills/${skill.id}`
        : `${orchestratorUrl}/projects/${projectId}/skills`;

      const response = await fetch(url, {
        method: skill ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, content }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save skill');
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 space-y-4">
      <h4 className="font-medium text-gray-900">{skill ? 'Edit Skill' : 'Add New Skill'}</h4>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            placeholder="e.g., mastra-development"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            placeholder="Short description of the skill"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Content (Markdown)</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className="mt-1 block w-full font-mono text-sm rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          placeholder="# Skill Title&#10;&#10;Detailed instructions and patterns..."
          required
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : skill ? 'Update Skill' : 'Create Skill'}
        </button>
      </div>
    </form>
  );
}
