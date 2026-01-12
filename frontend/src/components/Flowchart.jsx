import React from "react";

/*
  Inline SVG flowchart. Node ids correspond to returned recommended_test strings:
  pearson_correlation, spearman_correlation, chi_square, t_student, welch_t,
  wilcoxon, anova, kruskal_wallis
*/

const nodeStyle = (active) =>
  active
    ? { fill: "#0ea5a4", stroke: "#055e61", strokeWidth: 2 }
    : { fill: "#f3f4f6", stroke: "#9ca3af", strokeWidth: 1 };

export default function Flowchart({ recommendedTest }) {
  const active = (id) => id === recommendedTest;
  return (
    <svg viewBox="0 0 700 420" className="w-full" xmlns="http://www.w3.org/2000/svg">
      {/* Top decision */}
      <rect x="250" y="10" width="200" height="40" rx="6" style={nodeStyle(false)} />
      <text x="350" y="35" textAnchor="middle" fontSize="14">Czy X i Y są zależne?</text>

      {/* Both numeric -> correlation */}
      <rect x="70" y="80" width="180" height="40" rx="6" style={nodeStyle(false)} />
      <text x="160" y="105" fontSize="12">Obie cechy mierzalne</text>

      <rect x="70" y="140" width="180" height="40" rx="6" id="corr_choice" style={nodeStyle(false)} />
      <text x="160" y="165" fontSize="12">Test korelacji</text>

      <rect x="260" y="80" width="180" height="40" rx="6" style={nodeStyle(false)} />
      <text x="350" y="105" fontSize="12">Jedna mierzalna, druga kategoryczna</text>

      <rect x="450" y="80" width="180" height="40" rx="6" style={nodeStyle(false)} />
      <text x="540" y="105" fontSize="12">Obie niemierzalne</text>

      {/* correlation outputs */}
      <rect x="70" y="200" width="180" height="40" rx="6" id="pearson_correlation" style={nodeStyle(active("pearson_correlation"))} />
      <text x="160" y="225" fontSize="12" textAnchor="middle">Pearson</text>

      <rect x="70" y="260" width="180" height="40" rx="6" id="spearman_correlation" style={nodeStyle(active("spearman_correlation"))} />
      <text x="160" y="285" fontSize="12" textAnchor="middle">Spearman</text>

      {/* chi-square */}
      <rect x="450" y="140" width="180" height="40" rx="6" id="chi_square" style={nodeStyle(active("chi_square"))} />
      <text x="540" y="165" fontSize="12" textAnchor="middle">Chi-squared</text>

      {/* one numeric one categorical -> two categories -> t/wilcox etc */}
      <rect x="260" y="140" width="180" height="40" rx="6" id="group_choice" style={nodeStyle(false)} />
      <text x="350" y="165" fontSize="12" textAnchor="middle">Ile kategorii?</text>

      <rect x="260" y="200" width="160" height="40" rx="6" id="t_student" style={nodeStyle(active("t_student"))} />
      <text x="340" y="225" fontSize="12" textAnchor="middle">t-Student</text>

      <rect x="260" y="260" width="160" height="40" rx="6" id="welch_t" style={nodeStyle(active("welch_t"))} />
      <text x="340" y="285" fontSize="12" textAnchor="middle">Welch t</text>

      <rect x="260" y="320" width="160" height="40" rx="6" id="wilcoxon" style={nodeStyle(active("wilcoxon"))} />
      <text x="340" y="345" fontSize="12" textAnchor="middle">Wilcoxon</text>

      {/* >=3 categories */}
      <rect x="410" y="200" width="200" height="40" rx="6" id="anova" style={nodeStyle(active("anova"))} />
      <text x="510" y="225" fontSize="12" textAnchor="middle">ANOVA</text>

      <rect x="410" y="260" width="200" height="40" rx="6" id="kruskal_wallis" style={nodeStyle(active("kruskal_wallis"))} />
      <text x="510" y="285" fontSize="12" textAnchor="middle">Kruskal-Wallis</text>

      {/* connectors (simple lines) */}
      <line x1="350" y1="50" x2="350" y2="80" stroke="#6b7280" strokeWidth="1" />
      <line x1="160" y1="120" x2="160" y2="200" stroke="#6b7280" strokeWidth="1" />
      <line x1="350" y1="120" x2="350" y2="140" stroke="#6b7280" strokeWidth="1" />
      <line x1="540" y1="120" x2="540" y2="140" stroke="#6b7280" strokeWidth="1" />
      <line x1="160" y1="240" x2="160" y2="260" stroke="#6b7280" strokeWidth="1" />
      <line x1="340" y1="180" x2="340" y2="200" stroke="#6b7280" strokeWidth="1" />
      <line x1="460" y1="180" x2="460" y2="200" stroke="#6b7280" strokeWidth="1" />
      <line x1="420" y1="240" x2="420" y2="200" stroke="#6b7280" strokeWidth="1" />
    </svg>
  );
}